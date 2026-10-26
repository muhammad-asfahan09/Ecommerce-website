import express from "express";
import {
  authorizedRoles,
  isAuthenticated,
} from "../middlewares/authMiddleware.js";
import { dashboardStats, deleteUser, getAllUsers } from "../controllers/adminController.js";

const router = express.Router();

router.get("/getAllUsers",isAuthenticated,authorizedRoles("Admin"),getAllUsers);

router.delete("/deleteUser/:userId",isAuthenticated,authorizedRoles("Admin"),deleteUser);

router.get("/dashboard-state",isAuthenticated,authorizedRoles("Admin"),dashboardStats);


export default router;
