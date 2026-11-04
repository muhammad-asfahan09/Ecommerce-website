import express from "express";
import { config } from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { urlencoded } from "express";
import fileUpload from "express-fileupload";
import { createTable } from "./utils/createTable.js";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import authRouter from "./routes/authRoutes.js";
import productRouter from "./routes/productRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import orderRouter from "./routes/orderRoutes.js";

import stripe from "stripe";
import database from "./database/db.js";

const app = express();

config({ path: "./config/config.env" });

app.use(
  cors({
    origin: [process.env.FRONTEND_URL, process.env.DASHBOARD_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      return res.status(400).send(`Webhook Error: ${error.message || error}`);
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntentId = event.data.object.id;
      try {
        const paymentResult = await database.query(
          `UPDATE payments SET payment_status = 'paid'
           WHERE payment_intent_id = $1 AND payment_status <> 'paid'
           RETURNING *`,
          [paymentIntentId],
        );

        // already processed (duplicate event)
        if (paymentResult.rows.length === 0) {
          return res.status(200).send({ received: true });
        }

        const orderId = paymentResult.rows[0].order_id;

        await database.query(
          `UPDATE orders SET paid_at = NOW() WHERE id = $1`,
          [orderId],
        );

        const { rows: orderItems } = await database.query(
          `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
          [orderId],
        );

        for (const item of orderItems) {
          await database.query(
            `UPDATE products SET stock = stock - $1 WHERE id = $2`,
            [item.quantity, item.product_id],
          );
        }
      } catch (error) {
        console.error("Webhook DB error:", error);
        return res.status(500).send("Error updating order after payment");
      }
    }

    res.status(200).send({ received: true });
  },
);

// chech database all table create
createTable();

// middlewares
app.use(express.json());
app.use(cookieParser());
app.use(urlencoded({ extended: true }));
app.use(
  fileUpload({
    tempFileDir: "./uploads",
    useTempFiles: true,
  }),
);
// route fix
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/order", orderRouter);


app.use(errorMiddleware);
export default app;
