
export const fetchAllProducts = catchAsyncError(async (req, res, next) => {
  const { availability, price, category, rating, search } = req.query;

  // Pagination
  const requestedPage = parseInt(req.query.page, 10);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const limit = 10;
  const offset = (page - 1) * limit;

  const condition = [];
  const value = [];
  let index = 1;

  // Filter products by availability
  if (availability === "in-stock") {
    condition.push("p.stock > 5");
  } else if (availability === "limited") {
    condition.push("p.stock > 0 AND p.stock <= 5");
  } else if (availability === "out-of-stock") {
    condition.push("p.stock = 0");
  }

  // Filter products by price (example: price=100-1000)
  if (price) {
    const [minPrice, maxPrice] = price.split("-");

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice.trim() !== "" &&
      maxPrice.trim() !== "" &&
      Number.isFinite(Number(minPrice)) &&
      Number.isFinite(Number(maxPrice)) &&
      Number(minPrice) <= Number(maxPrice)
    ) {
      condition.push(`p.price BETWEEN $${index} AND $${index + 1}`);
      value.push(Number(minPrice), Number(maxPrice));
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
  if (rating !== undefined && rating !== "") {
    const minRating = Number(rating);

    if (Number.isFinite(minRating) && minRating >= 0 && minRating <= 5) {
      condition.push(`p.ratings >= $${index}`);
      value.push(minRating);
      index++;
    }
  }

  // Search products by name or description
  if (search) {
    condition.push(
      `(p.name ILIKE $${index} OR p.description ILIKE $${index})`
    );
    value.push(`%${search}%`);
    index++;
  }

  // Build WHERE clause
  const whereClause = condition.length
    ? `WHERE ${condition.join(" AND ")}`
    : "";

  // Count filtered products
  const totalProductsResult = await database.query(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    value
  );

  const totalProducts = parseInt(totalProductsResult.rows[0].count, 10);

  // Add pagination parameters
  const paginationPlaceholder = {};

  paginationPlaceholder.limit = `$${index}`;
  value.push(limit);
  index++;

  paginationPlaceholder.offset = `$${index}`;
  value.push(offset);

  // Fetch filtered and paginated products
  const query = `
    SELECT
      p.*,
      COUNT(r.id)::int AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ${paginationPlaceholder.limit}
    OFFSET ${paginationPlaceholder.offset}
  `;

  const result = await database.query(query, value);

  // Fetch new products from the last 30 days
  const newProductQuery = `
    SELECT
      p.*,
      COUNT(r.id)::int AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 8
  `;

  const newProductResult = await database.query(newProductQuery);

  // Fetch top-rated products
  const topRatedQuery = `
    SELECT
      p.*,
      COUNT(r.id)::int AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.ratings >= 4.5
    GROUP BY p.id
    ORDER BY p.ratings DESC, p.created_at DESC
    LIMIT 8
  `;

  const topRatedResult = await database.query(topRatedQuery);

  // Send response
  res.status(200).json({
    success: true,
    products: result.rows,
    totalProducts,
    currentPage: page,
    totalPages: Math.ceil(totalProducts / limit),
    newProducts: newProductResult.rows,
    topRatedProducts: topRatedResult.rows,
  });
});

