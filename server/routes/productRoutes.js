import express from "express";
import {
  createProducts,
  deleteProduct,
  deleteReview,
  fetchAIFilteredProducts,
  fetchAllProducts,
  postProductReview,
  singleFetchProducts,
  updateProduct,
} from "../controllers/productController.js";
import {
  authorizedRoles,
  isAuthenticated,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post(
  "/admin/create",
  isAuthenticated,
  authorizedRoles("Admin"),
  createProducts,
);
router.get("/", fetchAllProducts);
router.get("/singleProductFetch/:prodId", singleFetchProducts);
router.put(
  "/admin/update/:prodId",
  isAuthenticated,
  authorizedRoles("Admin"),
  updateProduct,
);
router.delete(
  "/admin/delete/:prodId",
  isAuthenticated,
  authorizedRoles("Admin"),
  deleteProduct,
);
router.put("/post-new/review/:prodId", isAuthenticated, postProductReview);
router.delete("/delete/review/:prodId", isAuthenticated, deleteReview);
router.post("/Ai-search", isAuthenticated, fetchAIFilteredProducts);

export default router;
