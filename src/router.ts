import express from 'express';
import path from 'path';
import userController from './controllers/user.controller';
import ordersController from './controllers/orders.controller';
import productController from './controllers/product.controller';
import makeUploader from './libs/utils/uploader';

const router = express.Router();

router.get('/', userController.goHome)
router.get('/customer/sellers', userController.getSellers);
// router.get('/user/top-sellers', userController.getTopSellers);

// Auth Routers
router.post("/auth/signup", userController.signup);
router.post("/auth/login", userController.login);
router.post("/auth/logout", userController.logout);
router.get("/auth/me", userController.verifyAuth, userController.getUser);
router.put("/auth/profile",
    userController.verifyAuth,
    makeUploader("users").single("userImage"),
    userController.updateProfile
);

router.get("/user/customer/:id", userController.verifyAuth, userController.getCustomer);
router.get("/user/seller/:id", userController.retrieveAuth, userController.getSeller);

router.post("/auth/profile",
    userController.verifyAuth,
    makeUploader("users").single("userImage"),
    userController.updateProfile
);

// Product
router
.get("/customer/products", productController.getProducts)
.get("/customer/product/ai-search", productController.aiSearchProducts)
.get("/customer/product/recommendations", userController.retrieveAuth, productController.getRecommendedProducts)
.get("/customer/product/:id/similar", productController.getSimilarProducts)
.get("/customer/product/detail/:id",
    userController.verifyAuth,
    productController.getProduct)

// Order
router
.post("/order/create",
    userController.verifyAuth,
    ordersController.createOrder)
.post("/order/update",
    userController.verifyAuth,
    ordersController.updateOrder)

router
.get("/order/all",
    userController.verifyAuth,
    ordersController.getMyOrders)

export default router;
