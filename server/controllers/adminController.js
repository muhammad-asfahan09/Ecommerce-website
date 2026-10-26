import catchAsyncError from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import { v2 as cloudinary } from "cloudinary";

import { json } from "express";
import { Query } from "pg";

export const getAllUsers = catchAsyncError(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;

  const totalUsersResult = await database.query(
    `SELECT COUNT(*) FROM users WHERE role = $1`,
    ["User"],
  );

  const totalUser = parseInt(totalUsersResult.rows[0].count);

  const offset = (page - 1) * 10;

  const users = await database.query(
    `SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    ["User", 10, offset],
  );

  res.status(200).json({
    success: true,
    totalUser,
    currentPage: page,
    users: users.rows,
  });
});

export const deleteUser = catchAsyncError(async (req, res, next) => {
  const { userId } = req.params;

  const isUserExit = await database.query(
    "SELECT * FROM users where role = $1 AND id = $2",
    ["User", userId],
  );

  if (isUserExit.rows.length === 0) {
    return next(new ErrorHandler("User not found.", 404));
  }

  const user = await database.query(
    "DELETE FROM users WHERE id = $1 AND role = $2 RETURNING *",
    [userId, "User"],
  );
  const avatar = user.rows[0].avatar;
  if (avatar?.public_id) {
    await cloudinary.uploader.destroy(avatar.public_id);
  }
  res.status(200).json({
    success: true,
    message: "User deleted successfully",
  });
});

export const dashboardStats = catchAsyncError(async (req, res, next) => {
  const today = new Date();
  const todayDate = today.toISOString().split("T")[0];
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const yesterdayDate = today.toISOString().split("T")[0];

  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousMonthStart = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
  );
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const totalRevenueAllTimeQuery = await database.query(
    `SELECT SUM(total_price) FROM orders`,
  );
  const totalRevenueAllTime =
    parseFloat(totalRevenueAllTimeQuery.rows[0].sum) || 0;

  const totalUserCountQuery = await database.query(
    `SELECT COUNT(*) FROM users where role = 'User'`,
  );
  const totalUserCount = parseInt(totalUserCountQuery.rows[0].count) || 0;

  //   Order Status Count

  const orderStatusCountQuery = await database.query(
    `SELECT order_status, COUNT(*) FROM orders GROUP BY order_status `,
  );
  const orderStatusCount = {
    Processing: 0,
    Shipped: 0,
    Delivered: 0,
    Cancelled: 0,
  };
  orderStatusCountQuery.rows.forEach((rows) => {
    orderStatusCount[row.order_status] = parseInt(row.count);
  });

  //   Today Revenue Query

  const todayRevenueQuery = await database.query(
    `SELECT SUM(total_price) FROM orders WHERE DATE(created_at) = $1`,
    [todayDate],
  );

  const todatRevenue = parseFloat(todayRevenueQuery.rows[0].sum) || 0;

  //   Yesterday Revenue Query

  const yesterdayRevenueQuery = await database.query(
    `SELECT SUM(total_price) FROM orders WHERE DATE(created_at) = $1`,
    [yesterdayDate],
  );

  const yesterdayRevenue = parseFloat(yesterdayRevenueQuery.rows[0].sum) || 0;

  //   Monthly sale Revenue
  const monthlySalesQuery = await database.query(
    `SELECT TO_CHAR(created_at, 'Mon YYYY') AS month,
    DATE_TRUNC('month', craeted_at) as date,
    SUM(total_price) as totalsales
    FROM orders
    GROUP BY month,data 
    ORDER BY date ASC`,
  );

  const monthlySales = monthlySalesQuery.rows.map((row) => ({
    month: row.month,
    totalSales: parseFloat(row.totalSales) || 0,
  }));

  //   Top 5 most sale products

  const topSellingProductsQuery = await database.query(
    `SELECT p.name, 
    p.image->0->>'url' AS image,
    p.category,
    p.rating,
    SUM(oi.quantity) AS total_sold
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    GROUP BY p.name, p.image, p.category, p.ratings
    ORDER BY total_sold DESC
    LIMIT 5
    `,
  );
  const topProducts = topSellingProductsQuery.rows;

  //   Total sales of Current Month
  const currentMonthSaleQuery = await database.query(
    `SELECT SUM(total_price) AS total FROM orders WHERE created_at >= $1 AND created_at < (CURRENT_DATE + INTERVAL '30 DAY')`,
    [currentMonthStart],
  );
});
