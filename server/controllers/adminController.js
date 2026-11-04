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
  //  Get TodayDate
  const today = new Date();
  const todayDate = today.toISOString().split("T")[0];

  // Get yesterday Data
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().split("T")[0];

  //   CurrentMonthStart And currentMonthEnd
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const currentMonthEnd = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    1,
  );

  //    previousMonthStart And previousMonthEnd
  const previousMonthStart = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    1,
  );
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 1);

  //   total revenue count
  const totalRevenueAllTimeQuery = await database.query(
    `SELECT SUM(total_price) FROM orders`,
  );
  const totalRevenueAllTime =
    parseFloat(totalRevenueAllTimeQuery.rows[0].sum) || 0;

  // total user count
  const totalUserCountQuery = await database.query(
    `SELECT COUNT(*) FROM users where role = 'User'`,
  );
  const totalUserCount = parseInt(totalUserCountQuery.rows[0].count) || 0;

  //   Order Status Count >>>
  const orderStatusCountQuery = await database.query(
    `SELECT order_status, COUNT(*) FROM orders GROUP BY order_status `,
  );
  const orderStatusCount = {
    Processing: 0,
    Shipped: 0,
    Delivered: 0,
    Cancelled: 0,
  };
  orderStatusCountQuery.rows.forEach((row) => {
    orderStatusCount[row.order_status] = parseInt(row.count);
  });

  //   Today Revenue Query
  const todayRevenueQuery = await database.query(
    `SELECT SUM(total_price) FROM orders WHERE DATE(created_at) = $1`,
    [todayDate],
  );

  const todayRevenue = parseFloat(todayRevenueQuery.rows[0].sum) || 0;

  //   Yesterday Revenue Query

  const yesterdayRevenueQuery = await database.query(
    `SELECT SUM(total_price) FROM orders WHERE DATE(created_at) = $1`,
    [yesterdayDate],
  );

  const yesterdayRevenue = parseFloat(yesterdayRevenueQuery.rows[0].sum) || 0;

  //   Monthly sale Revenue
  const monthlySalesQuery = await database.query(
    `SELECT TO_CHAR(created_at, 'Mon YYYY') AS month,
    DATE_TRUNC('month', created_at) as date,
    SUM(total_price) as totalSales
    FROM orders
    GROUP BY month, date
    ORDER BY date ASC`,
  );

  const monthlySales = monthlySalesQuery.rows.map((row) => ({
    month: row.month,
    totalSales: parseFloat(row.totalSales) || 0,
  }));

  //   Top 5 most sale products

  const topSellingProductsQuery = await database.query(
    `SELECT p.name, 
    p.images->0->>'url' AS image,
    p.category,
    p.ratings,
    SUM(oi.quantity) AS total_sold
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    GROUP BY p.name, p.images, p.category, p.ratings
    ORDER BY total_sold DESC
    LIMIT 5
    `,
  );
  const topSellingProducts = topSellingProductsQuery.rows;

  //   Total sales of Current Month
  const currentMonthSaleQuery = await database.query(
    `SELECT SUM(total_price) AS total 
    FROM orders 
    WHERE created_at >= $1 AND created_at < $2`,
    [currentMonthStart, currentMonthEnd],
  );

  const currentMonthSales =
    parseFloat(currentMonthSaleQuery.rows[0].total) || 0;

  // Products with stock less then or equal 5
  const lowStockProductsQuery = await database.query(
    `SELECT name,stock FROM products WHERE stock <= 5`,
  );

  const lowStockProduct = lowStockProductsQuery.rows;

  //   Revenue Growth Rate %
  const lastMonthRevenueQuery = await database.query(
    `SELECT SUM(total_price) AS total 
    FROM orders 
    where created_at >= $1 AND created_at < $2 `,
    [previousMonthStart, previousMonthEnd],
  );
  const lastMonthRevenue = parseFloat(lastMonthRevenueQuery.rows[0].total) || 0;

  let revenueGrowth = "0%";
  if (lastMonthRevenue > 0) {
    const growthRate =
      ((currentMonthSales - lastMonthRevenue) / lastMonthRevenue) * 100;
    revenueGrowth = `${growthRate >= 0 ? "+" : ""}${growthRate.toFixed(2)}%`;
  }

  //   New user this month
  const newUserThisMonthQuery = await database.query(
    `SELECT COUNT(*) FROM users
   WHERE created_at >= $1 AND created_at < $2 AND role = 'User'`,
    [currentMonthStart, currentMonthEnd],
  );
  const newUserThisMonth = parseFloat(newUserThisMonthQuery.rows[0].count) || 0;

  res.status(200).json({
    success: true,
    message: "Dashboard states fetched successfully",
    totalRevenueAllTime,
    todayRevenue,
    yesterdayRevenue,
    totalUserCount,
    orderStatusCount,
    monthlySales,
    currentMonthSales,
    topSellingProducts,
    lowStockProduct,
    revenueGrowth,
    newUserThisMonth,
  });
});
