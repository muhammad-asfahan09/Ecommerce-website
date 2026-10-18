import CreateUserTable from "../models/userTable.js";
import CreateShippingInfoTable from "../models/shippinginfoTable.js";
import CreateProductsTable from "../models/productsTable.js";
import CreateProductsReviewsTable from "../models/productReviewsTable.js";
import CreatePaymentsTable from "../models/paymentsTable.js";
import CreateOrderTable from "../models/ordersTable.js";
import CreateOrdersItemsTable from "../models/orderItemsTable.js";

export const createTable = async () => {
  try {
    await CreateUserTable();
    await CreateProductsTable();
    await CreateProductsReviewsTable();
    await CreateOrderTable();
    await CreateOrdersItemsTable();
    await CreateShippingInfoTable();
    await CreatePaymentsTable();
    console.log("All tables created.")
  } catch (error) {
    console.log("Error reating tables:", error);
  }
};

