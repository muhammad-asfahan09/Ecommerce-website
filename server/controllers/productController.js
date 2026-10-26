import catchAsyncError from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
import { v2 as cloudinary } from "cloudinary";
import { getAIRecommendation } from "../utils/getAIRecommendation.js";

export const createProducts = catchAsyncError(async (req, res, next) => {
  const { name, description, price, category, stock } = req.body;

  if (!name || !description || !price || !category || stock === undefined) {
    return next(new ErrorHandler("Please provide all required fields.", 400));
  }

  const created_by = req.user.id;
  let uploadImages = [];

  // Upload images to Cloudinary
  if (req.files?.images) {
    const images = [].concat(req.files.images);

    for (const image of images) {
      try {
        const result = await cloudinary.uploader.upload(image.tempFilePath, {
          folder: "Ecommerce_product_images",
          width: 1000,
          crop: "scale",
        });

        uploadImages.push({
          public_id: result.public_id,
          url: result.secure_url,
        });
      } catch (error) {
        return next(new ErrorHandler("Product image upload failed.", 500));
      }
    }
  }

  const products = await database.query(
    `INSERT INTO products
    (name, description, price, category, stock, images, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      name,
      description,
      price,
      category,
      stock,
      JSON.stringify(uploadImages),
      created_by,
    ],
  );

  return res.status(201).json({
    success: true,
    message: "Product created successfully",
    product: products.rows[0],
  });
});

export const fetchAllProducts = catchAsyncError(async (req, res, next) => {
  const { availibility, price, category, rating, search } = req.query;

  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const condition = [];
  let value = [];
  let index = 1;

  let paginationPlaceholder = {};

  // Filter products by availibility
  if (availibility === "in-stock") {
    condition.push("p.stock > 5");
  } else if (availibility === "limited") {
    condition.push("p.stock > 0 AND p.stock <= 5");
  } else if (availibility === "out-of-stock") {
    condition.push("p.stock = 0");
  }

  // Filter products by price
  if (price) {
    const [minPrice, maxPrice] = price.split("-");

    if (minPrice && maxPrice) {
      condition.push(`p.price BETWEEN $${index} AND $${index + 1}`);
      value.push(minPrice, maxPrice);
      index += 2;
    }
  }

  // Filter products by category
  if (category) {
    condition.push(`p.category ILIKE $${index}`);
    value.push(`%${category}%`);
    index++;
  }

  // Filter products by rating
  if (rating) {
    condition.push(`p.ratings >= $${index}`);
    value.push(rating);
    index++;
  }

  // Filter products by search
  if (search) {
    condition.push(`(p.name ILIKE $${index} OR p.description ILIKE $${index})`);
    value.push(`%${search}%`);
    index++;
  }

  const whereClause = condition.length
    ? `WHERE ${condition.join(" AND ")}`
    : "";

  const totalProductsResult = await database.query(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    value,
  );

  const totalProducts = parseInt(totalProductsResult.rows[0].count);

  paginationPlaceholder.limit = `$${index}`;
  value.push(limit);
  index++;

  paginationPlaceholder.offset = `$${index}`;
  value.push(offset);

  const query = `
    SELECT p.*, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ${paginationPlaceholder.limit}
    OFFSET ${paginationPlaceholder.offset}
  `;

  const result = await database.query(query, value);

  const newProductQuery = `
    SELECT p.*, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 8
  `;

  const newProductResult = await database.query(newProductQuery);

  // Top-rated products
  const topRatedQuery = `
    SELECT p.*, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.ratings >= 4.5
    GROUP BY p.id
    ORDER BY p.ratings DESC, p.created_at DESC
    LIMIT 8
  `;

  const topRatedResult = await database.query(topRatedQuery);

  res.status(200).json({
    success: true,
    products: result.rows,
    totalProducts,
    newProducts: newProductResult.rows,
    topRatedProducts: topRatedResult.rows,
  });
});

export const updateProduct = catchAsyncError(async (req, res, next) => {
  const { prodId } = req.params;

  const { name, description, price, category, stock } = req.body;

  if (!name || !description || !price || !category || stock === undefined) {
    return next(new ErrorHandler("Please provide all required fields.", 400));
  }

  const product = await database.query(
    `SELECT * FROM products WHERE id = $1 `,
    [prodId],
  );

  if (product.rowCount.length === 0) {
    return next(new ErrorHandler("Product not found.", 400));
  }

  const result = await database.query(
    `UPDATE products SET name = $1 , description = $2 , price = $3 , category = $4 , stock = $5 WHERE id = $6 RETURNING*`,
    [name, description, price, category, stock, prodId],
  );

  res.status(200).json({
    success: true,
    message: "Products updated successfully",
    updatedProduct: result.rows[0],
  });
});

export const deleteProduct = catchAsyncError(async (req, res, next) => {
  const { prodId } = req.params;

  const product = await database.query(`SELECT * FROM products WHERE id = $1`, [
    prodId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 400));
  }
  const images = product.rows[0].images;

  const deleteProducts = await database.query(
    `DELETE FROM products WHERE id = $1 RETURNING*`,
    [prodId],
  );
  if (images && images.length > 0) {
    for (const image of images) {
      await cloudinary.uploader.destroy(image.public_id);
    }
  }
  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
  });
});

export const singleFetchProducts = catchAsyncError(async (req, res, next) => {
  const { prodId } = req.params;

  const result = await database.query(
    `SELECT p.*,
    COALESCE(
      json_agg(
        json_build_object(
          'review_id', r.id,
          'ratings', r.rating,
          'comment', r.comment,
          'reviewer', json_build_object(
            'id', u.id,
            'name', u.name,
            'avatar', u.avatar
          )
        )
      ) FILTER (WHERE r.id IS NOT NULL),
      '[]'::json
    ) AS reviews
     FROM products p
    LEFT JOIN reviews r ON r.product_id = p.id
    LEFT JOIN users u ON u.id = r.user_id
    WHERE p.id = $1
    GROUP BY p.id`,
    [prodId],
  );

  if (result.rows.length === 0) {
    return next(new ErrorHandler("Product not found", 404));
  }

  res.status(200).json({
    success: true,
    product: result.rows[0],
  });
});

export const postProductReview = catchAsyncError(async (req, res, next) => {
  const { prodId } = req.params;
  const { rating, comment } = req.body;

  if (!rating || !comment) {
    return next(new ErrorHandler("Please provide rating and comment", 400));
  }

  const purchaseCheckQuery = `
    SELECT oi.product_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN payments p ON p.order_id = o.id
    WHERE o.buyer_id = $1
    AND oi.product_id = $2
    AND p.payment_status = 'paid'
    LIMIT 1
  `;

  const { rows } = await database.query(purchaseCheckQuery, [
    req.user.id,
    prodId,
  ]);

  if (rows.length === 0) {
    return res.status(403).json({
      success: false,
      message: "You can only review a product you've purchased.",
    });
  }

  const product = await database.query("SELECT * FROM products WHERE id = $1", [
    prodId,
  ]);

  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }

  const isAlreadyReview = await database.query(
    "SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2",
    [prodId, req.user.id],
  );

  let review;

  if (isAlreadyReview.rows.length > 0) {
    review = await database.query(
      `UPDATE reviews
       SET rating = $1, comment = $2
       WHERE product_id = $3 AND user_id = $4
       RETURNING *`,
      [rating, comment, prodId, req.user.id],
    );
  } else {
    review = await database.query(
      `INSERT INTO reviews (product_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [prodId, req.user.id, rating, comment],
    );
  }

  const allReviews = await database.query(
    "SELECT AVG(rating) AS avg_rating FROM reviews WHERE product_id = $1",
    [prodId],
  );

  const newAvgRating = allReviews.rows[0].avg_rating;

  const updatedProduct = await database.query(
    "UPDATE products SET ratings = $1 WHERE id = $2 RETURNING *",
    [newAvgRating, prodId],
  );

  res.status(200).json({
    success: true,
    message: "Review posted.",
    review: review.rows[0],
    product: updatedProduct.rows[0],
  });
});

export const deleteReview = catchAsyncError(async (req, res, next) => {
  const { prodId } = req.params;

  const review = await database.query(
    `DELETE FROM reviews WHERE product_id = $1 AND user_id = $2 RETURNING*`,
    [prodId, req.user.id],
  );
  if (review.rows.length === 0) {
    return next(new ErrorHandler("Review not found", 400));
  }

  const allReviews = await database.query(
    "SELECT AVG(rating) AS avg_rating FROM reviews WHERE product_id = $1",
    [prodId],
  );

  const newAvgRating = allReviews.rows[0].avg_rating;

  const updatedProduct = await database.query(
    "UPDATE products SET ratings = $1 WHERE id = $2 RETURNING *",
    [newAvgRating, prodId],
  );

  res.status(200).json({
    success: true,
    message: "Your review has been deleted.",
    review: review.rows[0],
    product: updatedProduct.rows[0],
  });
});

export const fetchAIFilteredProducts = catchAsyncError(
  async (req, res, next) => {
    const { userPrompt } = req.body;

    if (!userPrompt) {
      return next(new ErrorHandler("Provide a valid prompt", 400));
    }

    const filterKeywords = (query) => {
      const stopWords = new Set([
         "the",
        "they",
        "them",
        "then",
        "I",
        "we",
        "you",
        "he",
        "she",
        "it",
        "is",
        "a",
        "an",
        "of",
        "and",
        "or",
        "to",
        "for",
        "from",
        "on",
        "who",
        "whom",
        "why",
        "when",
        "which",
        "with",
        "this",
        "that",
        "in",
        "at",
        "by",
        "be",
        "not",
        "was",
        "were",
        "has",
        "have",
        "had",
        "do",
        "does",
        "did",
        "so",
        "some",
        "any",
        "how",
        "can",
        "could",
        "should",
        "would",
        "there",
        "here",
        "just",
        "than",
        "because",
        "but",
        "its",
        "it's",
        "if",
        ".",
        ",",
        "!",
        "?",
        ">",
        "<",
        ";",
        "`",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",

      ]);

      return query
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((word) => word && !stopWords.has(word))
        .map((word) => `%${word}%`);
    };

    const keywords = filterKeywords(userPrompt);

    if (keywords.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No products found matching your prompt.",
        products: [],
      });
    }

    const result = await database.query(
      `SELECT * FROM products
       WHERE name ILIKE ANY($1)
          OR description ILIKE ANY($1)
          OR category ILIKE ANY($1)
       LIMIT 200`,
      [keywords],
    );

    const filterProducts = result.rows;

    if (filterProducts.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No products found matching your prompt.",
        products: [],
      });
    }

    const { success, products } = await getAIRecommendation(
      userPrompt,
      filterProducts,
    );

    res.status(200).json({
      success,
      message: "AI filtered products",
      products,
    });
  },
);
