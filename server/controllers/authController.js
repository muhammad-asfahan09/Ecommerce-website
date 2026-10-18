import errorMiddleware from "../middlewares/errorMiddleware.js";
import catchAsyncError from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import bcrypt from "bcryptjs";
import { sendToken } from "../utils/jwtToken.js";
import { generateResetPasswordToken } from "../utils/generateResetPasswordToken.js";
import { generateForgetPasswordEmailToken } from "../utils/generateForgetPasswordEmailToken.js";
import { sendEmail } from "../utils/sendEmail.js";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

export const register = catchAsyncError(async (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return next(new ErrorHandler("Please provide all required fields.", 400));
  }

  const isAlreadyRegister = await database.query(
    "SELECT * FROM users WHERE email = $1",
    [email],
  );

  if (isAlreadyRegister.rows.length > 0) {
    return next(
      new ErrorHandler("User already registered with this email.", 400),
    );
  }

  const hashPassword = await bcrypt.hash(password, 10);
  const user = await database.query(
    "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
    [name, email, hashPassword],
  );

  sendToken(user.rows[0], 201, "User created successfully", res);
});

export const login = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new ErrorHandler("please provide email and password.", 400));
  }
  const user = await database.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);
  if (user.rows.length === 0) {
    return next(new ErrorHandler("wrong email.", 400));
  }
  const passwordMatch = await bcrypt.compare(password, user.rows[0].password);
  if (!passwordMatch) {
    return next(new ErrorHandler("Wrong  password.", 400));
  }
  sendToken(user.rows[0], 201, "User created successfully", res);
});

export const getUser = catchAsyncError(async (req, res, next) => {
  const { user } = req;
  res.status(200).json({
    success: true,
    user,
  });
});

export const logout = catchAsyncError(async (req, res, next) => {
  res
    .status(200)
    .cookie("token", "", {
      expires: new Date(Date.now()),
      httpOnly: true,
    })
    .json({
      success: true,
      message: "Logged out successfully",
    });
});

export const forgotPassword = catchAsyncError(async (req, res, next) => {
  const { email } = req.body;
  const { frontendUrl } = req.body;

  let userResult = await database.query(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );

  if (userResult.rows.length === 0) {
    return next(new ErrorHandler("User not found with this email", 400));
  }
  const user = userResult.rows[0];
  const { resetToken, hashedToken, resetPasswordExpireTime } =
    generateResetPasswordToken();

  await database.query(
    `UPDATE users SET reset_password_token = $1, reset_password_expire = to_timestamp($2) WHERE email = $3`,
    [hashedToken, resetPasswordExpireTime / 1000, email],
  );

  const resetPasswordUrl = `${frontendUrl}/password/reset/${resetToken}`;

  const message = generateForgetPasswordEmailToken(resetPasswordUrl);

  try {
    await sendEmail({
      email: user.email,
      subject: "Password Recovery",
      message,
    });

    console.log("Email sent successfully");

    return res.status(200).json({
      success: true,
      message: "Password reset email sent successfully",
    });
  } catch (error) {
    console.error("Email Error:", error);
    return next(new ErrorHandler("Email could not be send", 500));
  }
});

export const resetPassword = catchAsyncError(async (req, res, next) => {
  const { token } = req.params;
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await database.query(
    `SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expire > NOW()`,
    [resetPasswordToken],
  );
  if (user.rows.length === 0) {
    return next(
      new ErrorHandler("User not found and expired reset token", 400),
    );
  }
  if (req.body.password !== req.body.confirmPassword) {
    return next(new ErrorHandler("Password do not match", 400));
  }
  if (
    req.body.password.length < 8 ||
    req.body.password.length > 16 ||
    req.body.confirmPassword.length < 8 ||
    req.body.confirmPassword.length > 16
  ) {
    return next(
      new ErrorHandler("Password must be between 8 and 16 character. ", 400),
    );
  }

  const hashedPassword = await bcrypt.hash(req.body.password, 10);

  const updateUser = await database.query(
    `UPDATE users SET password = $1, reset_password_token = NULL ,  reset_password_expire = NULL where id = $2  RETURNING *`,
    [hashedPassword, user.rows[0].id],
  );
  sendToken(updateUser.rows[0], 201, "Password reset successfully", res);
});

export const updatePassword = catchAsyncError(async (req, res, next) => {
  const { Currentpassword, NewPassword, ConfirmPassword } = req.body;
  if (!Currentpassword || !NewPassword || !ConfirmPassword) {
    return next(new ErrorHandler("Please provide all required field", 400));
  }
  const isPasswordMatch = await bcrypt.compare(
    Currentpassword,
    req.user.password,
  );
  if (!isPasswordMatch) {
    return next(new ErrorHandler("Current password is incorrect", 400));
  }
  if (NewPassword !== ConfirmPassword) {
    return next(new ErrorHandler("New password do not match ", 400));
  }
  if (
    NewPassword.length < 8 ||
    NewPassword.length > 16 ||
    ConfirmPassword.length < 8 ||
    ConfirmPassword.length > 16
  ) {
    return next(
      new ErrorHandler("Password must be between 8 and 16 character. ", 400),
    );
  }
  const hashedPassword = await bcrypt.hash(NewPassword, 10);
  const updatePassword = await database.query(
    `UPDATE users SET password = $1 WHERE id = $2`,
    [hashedPassword, req.user.id],
  );
  res.status(200).json({
    success: true,
    message: "Password updated successfully",
  });
});

export const updateProfile = catchAsyncError(async (req, res, next) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return next(new ErrorHandler("Please provide all required field.", 400));
  }
  if (name.trim().length === 0 || email.trim().length === 0) {
    return next(new ErrorHandler("Name and email can not be empty.", 400));
  }
  let avatarData = {};
  if (req.files && req.files.avatar) {
    const { avatar } = req.files;
    if (req.user?.avatar?.public_id) {
      await cloudinary.uploader.destroy(req.user.avatar.public_id);
    }

    const newProfileImage = await cloudinary.uploader.upload(
      avatar.tempFilePath,
      {
        folder: "Ecommerce_avatar",
        width: 150,
        crop: "scale",
      },
    );
    avatarData = {
      public_id: newProfileImage.public_id,
      url: newProfileImage.secure_url,
    };
  }

  let user;
  if (Object.keys(avatarData).length === 0) {
    user = await database.query(
      `UPDATE users SET name = $1 , email = $2 WHERE id = $3 RETURNING*`,
      [name, email, req.user.id],
    );
  } else {
    user = await database.query(
      `UPDATE users SET name = $1 , email = $2 , avatar = $3 WHERE id = $4 RETURNING*`,
      [name, email, avatarData, req.user.id],
    );
  }
  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user: user.rows[0],
  });
});
