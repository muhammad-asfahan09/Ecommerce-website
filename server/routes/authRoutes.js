import express, { Router } from "express";
import {
  forgotPassword,
  getUser,
  login,
  logout,
  register,
  resetPassword,
  updatePassword,
  updateProfile,
} from "../controllers/authController.js";
import { isAuthenticated } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/getuser", isAuthenticated, getUser);
router.get("/logout", isAuthenticated, logout);
router.post("/password/forgot", forgotPassword);
router.put("/password/forgot/:token", resetPassword);
router.put("/password/update", isAuthenticated, updatePassword);
router.put("/profile/update", isAuthenticated, updateProfile);





export default router;
