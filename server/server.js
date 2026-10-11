import app from "./app.js";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  Cloud_name: process.env.CLOUDINARY_CLIENT_NAME,
  Api_key: process.env.CLOUDINARY_CLIENT_API,
  Api_secret: process.env.CLOUDINARY_CLIENT_SECRET,
});

try {
  app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
  });
} catch (error) {
  console.log(`Server not runnin: ${error}`);
}
