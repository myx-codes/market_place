import { Errors, HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import { NextFunction, Request, Response } from "express"
import { CustomerInQuery, LoginInput, UserInput, UserUpdateInput } from "../libs/types/user";
import { UserStatus, UserType } from "../libs/enums/user.enums";
import SellerService from "../models/Seller.service";
import { SellerRequest } from "../libs/types/user";
import UserService from "src/models/User.service";
import OrderService from "../models/Orders.service";
import ProductService from "../models/Product.service";

const sellerController: T = {};
const sellerService = new SellerService();
const orderService = new OrderService();
const productService = new ProductService();


sellerController.goHome = ( req: Request, res: Response) => {
    try{
        console.log("Seller, goHome")
        res.render("home")
    }catch(err){
        console.log("Error, goHome", err)
        if(err instanceof Errors)res.status(err.code).json(err);
        else res.status(Errors.standard.code).json(Errors.standard);
    }
};



sellerController.getSignup = (req: Request, res: Response) => {
    try{
        console.log("Signup Page");
        res.render("signup");
    }
    catch(err){
        console.log("Error, go Signup", err)

    }
};


sellerController.getLogin = (req: Request, res: Response) => {
   try{
     console.log("Login Page")
    res.render("login")
   }catch(err){
    console.log("ErrorLogin Page", err)
   }
};


sellerController.goDashboard = async (req: SellerRequest, res: Response) => {
    try {
        console.log("Seller, goDashboard");
        if (!req.session?.user) {
            return res.redirect("/seller/login");
        }
        const user = req.session.user;
        const userId = user._id;
        const [totalRevenue, totalOrders, productsCount, salesByDay, topProducts] = await Promise.all([
            orderService.getSellerRevenue(userId),
            orderService.getTotalOrdersCount(user, { page: 1, limit: 1, orderStatus: "ALL" }),
            productService.getSellerProductsCount(userId),
            orderService.getSellerSalesByDay(userId, 7),
            orderService.getTopSellingProducts(userId, 5)
        ]);
        const conversionRate = productsCount > 0 && totalOrders > 0
            ? ((totalOrders / productsCount) * 100).toFixed(1) + "%"
            : "0%";
        res.render("dashboard", {
            user,
            totalRevenue,
            totalOrders,
            productsCount,
            conversionRate,
            salesByDay,
            topProducts,
            title: "Seller Dashboard | FENZO",
            description: "Seller dashboard for managing revenue, orders, products, and sales performance on FENZO.",
            keywords: "FENZO seller dashboard, ecommerce dashboard, sales analytics, product management",
            siteName: "FENZO",
            type: "website",
            url: `${req.protocol}://${req.get("host")}/seller/dashboard`,
            image: "/img/logoIcon.png",
        });
    } catch (err) {
        console.log("Error, goDashboard", err);
        res.redirect("/seller/login");
    }
};


sellerController.getCustomers = async (req: Request, res: Response) => {
    try {
        console.log("getCustomers");
        
        // 1. URL Query'dan parametrlarni olamiz
        const { page, limit, order, search, userStatus } = req.query;

        // 2. CustomerInQuery obyektini yasaymiz
        const inquery: CustomerInQuery = {
            order: order ? String(order) : 'createdAt', // Agar order kelmasa, default 'createdAt'
            page: Number(page) || 1,                    // Agar page kelmasa, default 1
            limit: Number(limit) || 8,                 // Agar limit kelmasa, default 10
        };

        // 3. Optional filtrlarni qo'shamiz (Search va Status)
        if (search) inquery.search = String(search);
        
        if (userStatus) inquery.userStatus = userStatus as UserStatus;

        // 4. Servicega so'rov yuboramiz
        const result = await sellerService.getCustomers(inquery);

        // 5. Frontendga Render qilamiz (EJS faylga)
        res.render("customers", {
            customers: result.list,         // Topilgan odamlar
            currentPage: inquery.page,      // Hozirgi sahifa
            totalPages: result.totalPage,   // Jami sahifalar
            // Filtrlarni ham qaytarib yuborsak, inputlarda saqlanib turadi (search valuelar)
            search: inquery.search || "",
            statusFilter: inquery.userStatus || ""
        });

    } catch (err) {
        console.log("Error, getCustomers:", err);
        if (err instanceof Errors) res.status(err.code).json(err);
        else res.status(Errors.standard.code).json(Errors.standard);
    }
};


sellerController.processSignup = async (req: SellerRequest, res: Response) => {
    try{
        console.log("processSignup ishladi!");
        console.log("Body:", req.body);
        console.log("FILE:", req.file);

        const files = req.file;
        if(!files)
            throw new Errors(HttpCode.BAD_REQUEST, Message.SOMETHING_WENT_WRONG);

        const newUser: UserInput = req.body;
        newUser.userImage = files?.path.replace(/\\/g, "/");
        newUser.userType = UserType.SELLER;
        newUser.userImage = req.file?.path;
        console.log("SIGNUP INPUT:", newUser);

        const result = await sellerService.processSignup(newUser);

        //SESSION AUTHENTICATION
        req.session.user = result;
        req.session.save(function(){
        res.redirect("/seller/dashboard")
        });
    }
    catch(err){
        console.log("Error, processSignup:", err);
        const message = err instanceof Errors ? err.message: Message.SOMETHING_WENT_WRONG;
        res.send(`<script>alert("${message}"); window.location.replace('/seller/signup')</script>`)
    }
};


sellerController.processLogin = async ( req: SellerRequest, res: Response) => {
    try{
        console.log("processLogin")
        console.log("Body", req.body)
        const input: LoginInput = req.body;
        const result = await sellerService.processLogin(input)

        if (result.userType !== UserType.SELLER) {
            console.log("You are not Authiration user")
            throw new Errors(HttpCode.FORBIDDEN, Message.NOT_ALLOWED)
        }

        //SESSION AUTHENTICATION
        console.log("LOGIN RESULT:", result);
        req.session.user = result;
        console.log("SESSION USER AFTER SAVE:", req.session.user);
        req.session.save(function(){
        res.redirect("/seller/dashboard")
        });
        console.log(`Seller: ${req.session.user.userNick}, Id: ${req.session.user._id}`)
    }catch(err){
        console.log("Error processLoin")
        if(err instanceof Errors)res.status(err.code).json(err);
        else res.status(Errors.standard.code).json(Errors.standard);
    }
};

sellerController.logout = async (req: SellerRequest, res: Response) => {
  try {
    console.log("[Seller] logout");
    req.session.destroy(function () {
      res.redirect("/seller");
    });
  } catch (err) {
    console.error("Error, logout:", err);
    res.redirect("/seller");
  }
};

sellerController.updateChosenUser = async (req: Request, res:Response) => {
   try{
    console.log("updateChosenUser");
    console.log("REQ.BODY", req.body)
    const result = await sellerService.updateChosenUser(req.body);
    res.status(HttpCode.OK).json({data: result});
   }catch(err){
    console.log("Error, updateChosenUser", err);
    if(err instanceof Errors)res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
   }
}

sellerController.checkAuthSession = async (req: SellerRequest, res: Response) => {
    try{
        console.log("checkAuthSession");
        if(req.session?.user)res.send(`<script> alert("${req.session.user.userNick}")</script>`);
        else res.send(`<script> alert("${Message.NOT_AUTHENTICATED}")</script>`)
    }catch(err){
        console.log("Error, checkAuthSession", err);
        res.send(err);
    }
};


sellerController.verifySeller = (
    req: SellerRequest, 
    res: Response, 
    next: NextFunction) => {
        if(req.session?.user?.userType === UserType.SELLER){
            req.user = req.session.user;
            return next();
        }else 
            return res.status(401).send(`<script> alert("${Message.NOT_AUTHENTICATED}"); window.location.replace('/seller/login')</script>`)
};


sellerController.getSellerSettings = async (req: Request, res: Response) => {
        try {
            console.log("getSellerSettings ishladi");
            
            // ID ni sessiyadan olamiz (URL dan emas!)
            const id = req.session.user?._id;
            if (!id) return res.redirect("/seller/login"); // Agar user bo'lmasa login ga

            // Service orqali toza ma'lumotni olamiz
            const data = await sellerService.getSellerSettings(id);

            // EJS ga 'user' nomi bilan yuboramiz
            res.render("sellerDetail", { user: data });
        } catch (err) {
            console.log("Error getSellerSettings:", err);
            res.redirect("/seller/dashboard");
        }
    };


    sellerController.updateSellerSettings = async (req: Request, res: Response) => {
        try {
            console.log("updateSellerSettings ishladi");
            
            const id = req.session.user?._id;
            if (!id) return res.redirect("/seller/login");

            const input: UserInput = req.body; // Formadagi text inputlar (nick, phone, desc)

            // Agar rasm yuklangan bo'lsa, uni inputga qo'shamiz
            if (req.file) {
                // Windows slashlarini to'g'irlash
                input.userImage = req.file.path.replace(/\\/g, "/");
            }

            // 1-qadam: Bazani yangilash
            const updatedUser = await sellerService.updateSellerSettings(id, input);

            // 2-qadam: Sessiyani yangilash (MUHIM!)
            // Agar buni qilmasangiz, page refresh bo'lsa ham eski rasm/ism turaveradi (headerda)
            req.session.user = updatedUser;

            // 3-qadam: Saqlash va qaytish
            req.session.save(function (err) {
                if (err) console.log("Session save error:", err);
                // Muvaffaqiyatli bo'lsa yana settingsga qaytamiz
                res.redirect("/seller/dashboard");
            });

        } catch (err) {
            console.log("Error updateSellerSettings:", err);
            // Xato bo'lsa ham settingsga qaytamiz (xabar chiqarish mumkin)
            res.redirect("/seller/settings");
        }
    }




export default sellerController;
