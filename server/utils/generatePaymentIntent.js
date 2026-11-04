import database from "../database/db.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function generatePaymentIntent(orderId, totalPrice) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalPrice * 100),
      currency: "pkr",
    });
    await database.query(
      "INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id) VALUES ($1,$2,$3,$4) RETURNING *",
      [orderId, "Online", "Pending", paymentIntent.id],
    );
    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.log("payment error:", error.message || error);
    return { success: false, message: "payment failed" };
  }
}
