import errorMiddleware from "../middlewares/errorMiddleware.js";
import catchAsyncError from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import bcrypt from "bcryptjs";
import { sendToken } from "../utils/jwtToken.js";
import { generateResetPasswordToken } from "../utils/generateResetPasswordToken.js";
import { generateForgetPasswordEmailToken } from "../utils/generateForgetPasswordEmailToken.js";
import { sendEmail } from "../utils/sendEmail.js";
import crypto, { generateKey } from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { generatePaymentIntent } from "../utils/generatePaymentIntent.js";

export const placeNewOrder = catchAsyncError(async (req, res, next) => {
  const {
    fullname,
    state,
    city,
    country,
    address,
    pincode,
    phone,
    orderItems,
  } = req.body;

  if (
    !fullname ||
    !state ||
    !city ||
    !country ||
    !address ||
    !pincode ||
    !phone
  ) {
    return next(
      new ErrorHandler("Please provide complete shipping details.", 400),
    );
  }
  const items = Array.isArray(orderItems) ? orderItems : JSON.parse(orderItems);

  if (!items || items.length === 0) {
    return next(new ErrorHandler("No items in cart.", 400));
  }

  const productIds = items.map((item) => item.product.id);
  const { rows: products } = await database.query(
    `SELECT id, price, stock, name FROM products WHERE id = ANY($1::uuid[])`,
    [productIds],
  );

  let totalPrice = 0;
  const value = [];
  const placeholder = [];
  let errorToSend = null; // forEach ke andar ka error yahan rakhenge

  items.forEach((item, index) => {
    if (errorToSend) return; //  pehle error ke baad baqi items skip

    const product = products.find((p) => p.id === item.product.id);

    if (!product) {
      errorToSend = new ErrorHandler(
        `Products not found for ID: ${item.product.id}`,
        400,
      );
      return;
    }
    if (item.quantity > product.stock) {
      errorToSend = new ErrorHandler(
        `Only ${product.stock} units availaible for ${product.name}`,
        400,
      );
      return;
    }

    //  price string ho sakta hai, isliye Number()
    const itemTotal = Number(product.price) * item.quantity;
    totalPrice += itemTotal;

    value.push(
      null,
      product.id,
      item.quantity,
      product.price,
      item.product.images?.[0]?.url || "", // images na ho to crash na ho
      product.name,
    );
    const offset = index * 6;

    //  aakhir wala extra comma hata diya
    placeholder.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`,
    );
  });

  //  forEach ke baad error check, ab yahan se function band hoga
  if (errorToSend) {
    return next(errorToSend);
  }

  const tax_price = 0.18;
  const shipping_price = total_price >= 5000 ? 0 : 200;
  //  total_price declare kiya aur totalPrice use kiya
  const total_price = Math.round(
    totalPrice + totalPrice * tax_price + shipping_price,
  );
  //  database mein tax ki rakam save ho, rate (0.008) nahi
  const taxAmount = Math.round(totalPrice * tax_price);

  const orderResult = await database.query(
    `INSERT INTO orders (buyer_id, total_price, tax_price, shipping_price) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.id, total_price, taxAmount, shipping_price],
  );
  const orderId = orderResult.rows[0].id;

  for (let i = 0; i < value.length; i += 6) {
    value[i] = orderId;
  }

  await database.query(
    `INSERT INTO order_items (order_id,product_id,quantity,price,image,title) VALUES ${placeholder.join(", ")} RETURNING *`,
    value,
  );

  await database.query(
    //  1$ ki jagah $1, 2$ ki jagah $2, ...
    `INSERT INTO shipping_info (order_id,full_name,state,city,country,address,pincode,phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [orderId, fullname, state, city, country, address, pincode, phone],
  );

  const paymentResponse = await generatePaymentIntent(orderId, total_price);
  if (!paymentResponse.success) {
    return next(new ErrorHandler("Payment failed. Try again ", 400));
  }
  res.status(200).json({
    success: true,
    message: "Order placed successfully.please proceed to payment.",
    PaymentIntent: paymentResponse.clientSecret,
    totalPrice: total_price, // final amount (tax + shipping ke saath)
  });
});

export const fetchSingleOrder = catchAsyncError(async (req, res, next) => {
  const { orderId } = req.params;

  const result = await database.query(
    `SELECT 
    o.*, 
    COALESCE(
        json_agg(
            json_build_object(
                'order_item_id', oi.id,
                'order_id', oi.order_id,
                'product_id', oi.product_id,
                'quantity', oi.quantity,
                'price', oi.price
            )
        ) FILTER (WHERE oi.id IS NOT NULL), '[]'
    ) AS order_items,
    json_build_object(
        'full_name', s.full_name,
        'state', s.state,
        'city', s.city,
        'country', s.country,
        'address', s.address,
        'pincode', s.pincode,
        'phone', s.phone
    ) AS shipping_info
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN shipping_info s ON o.id = s.order_id
WHERE o.id = $1
GROUP BY o.id, s.id;
`,
    [orderId],
  );

  res.status(200).json({
    success: true,
    message: "Order fetched.",
    order: result.rows[0],
  });
});

export const fetchMyOrder = catchAsyncError(async (req, res, next) => {
  const result = await database.query(
    `SELECT o.*, COALESCE(
    json_agg(
      json_build_object(
          'order_item_id', oi.id,
                'order_id', oi.order_id,
                'product_id', oi.product_id,
                'quantity', oi.quantity,
                'price', oi.price,
                'image', oi.image,
                'title', oi.title
      ) 
    ) FILTER (WHERE oi.id IS NOT NULL), '[]'
    ) AS order_items,
       json_build_object(
        'full_name', s.full_name,
        'state', s.state,
        'city', s.city,
        'country', s.country,
        'address', s.address,
        'pincode', s.pincode,
        'phone', s.phone
    ) AS shipping_info 
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN shipping_info s ON o.id = s.order_id
WHERE o.buyer_id = $1
GROUP BY o.id, s.id
`,
    [req.user.id],
  );

  res.status(200).json({
    success: true,
    message: "Your all orders are fetched.",
    myOrder: result.rows,
  });
});

export const fetchAllOrder = catchAsyncError(async (req, res, next) => {
  const result = await database.query(`SELECT o.*,
    COALESCE(json_agg(
      json_build_object(
        'order_item_id', oi.id,
                'order_id', oi.order_id,
                'product_id', oi.product_id,
                'quantity', oi.quantity,
                'price', oi.price,
                'image', oi.image,
                'title', oi.title
      )
    ) FILTER (WHERE oi.id IS NOT NULL), '[]' ) AS order_items, json_build_object(
    'full_name', s.full_name,
        'state', s.state,
        'city', s.city,
        'country', s.country,
        'address', s.address,
        'pincode', s.pincode,
        'phone', s.phone 
    ) AS shipping_info
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     LEFT JOIN shipping_info s ON o.id = s.order_id
     GROUP BY o.id, s.id
`);
  res.status(200).json({
    success: true,
    message: "All orders fetched.",
    allOrder: result.rows,
  });
});

export const orderUpdate = catchAsyncError(async (req, res, next) => {
  const { status } = req.body;
  const { orderID } = req.params;

  if (!status) {
    return next(new ErrorHandler("Provide a valid status for order.", 400));
  }

  const result = await database.query(`SELECT * FROM orders WHERE id = $1`, [
    orderID,
  ]);

  if (result.rows.length === 0) {
    return next(new ErrorHandler("Invalid order ID.", 400));
  }

  const updateOrder = await database.query(
    `UPDATE orders SET order_status = $1 WHERE id = $2 RETURNING *`,
    [status, orderID],
  );

  res.status(200).json({
    success: true,
    message: "Order updated successfully",
    orderUpdate: updateOrder.rows[0],
  });
});

export const orderDelete = catchAsyncError(async (req, res, next) => {
  const { orderID } = req.params;

  const result = await database.query(`SELECT * FROM orders WHERE id = $1`, [
    orderID,
  ]);

  if (result.rows.length === 0) {
    return next(new ErrorHandler("Invalid order ID", 404));
  }

  await database.query(`DELETE FROM orders WHERE id = $1 `, [orderID]);

  res.status(200).json({
    success: true,
    message: "Order deleted successfully",
  });
});
