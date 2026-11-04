import express from "express";
import {
  authorizedRoles,
  isAuthenticated,
} from "../middlewares/authMiddleware.js";
import {
  fetchAllOrder,
  fetchMyOrder,
  fetchSingleOrder,
  orderDelete,
  orderUpdate,
  placeNewOrder,
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/new", isAuthenticated, placeNewOrder);
router.get("/:orderId", isAuthenticated, fetchSingleOrder);
router.get("/orders/me", isAuthenticated, fetchMyOrder);
router.get(
  "/orders/getall",
  isAuthenticated,
  authorizedRoles("Admin"),
  fetchAllOrder,
);
router.put(
  "/orders/update/:orderID",
  isAuthenticated,
  authorizedRoles("Admin"),
  orderUpdate,
);
router.delete(
  "/orders/delete/:orderID",
  isAuthenticated,
  authorizedRoles("Admin"),
  orderDelete,
);

export default router;
