import { Request, Response } from "express";
import { T } from '../libs/types/common';
import ProductService from "../models/Product.service";
import { Errors, HttpCode, Message } from "../libs/Errors";
import { ExtendedRequest, SellerRequest } from "../libs/types/user";
import { ProductInput, ProductInquiry} from "../libs/types/product";
import { ProductCollection } from "../libs/enums/product.enums";
import { constrainedMemory } from "process";
import { shapeIntoMongooseObjectId } from "../libs/config";

const productController: T = {};
const productService = new ProductService()


// BSSR APIs

productController.aiSearchProducts = async (req: Request, res: Response) => {
  try {
    console.log("aiSearchProducts");

    const rawQueryParam = req.query.q ?? req.query.query ?? req.query.search ?? "";
    const rawQuery = Array.isArray(rawQueryParam)
      ? rawQueryParam.filter((item) => typeof item === "string").join(" ")
      : typeof rawQueryParam === "string"
        ? rawQueryParam
        : "";

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 100);

    const result = await productService.aiSearchProducts(rawQuery, { page, limit });
    res.status(HttpCode.OK).json(result);

  } catch (err) {
    console.log("Error, aiSearchProducts:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

productController.goAddProduct = ( req: Request, res: Response) => {
    try{
        console.log("Seller, addProduct")
        res.render("addProduct")
    }catch(err){
        console.log("Error, addProduct", err)
        if(err instanceof Errors)res.status(err.code).json(err);
        else res.status(Errors.standard.code).json(Errors.standard);
    }
};

productController.getAllProducts = async (req: SellerRequest, res: Response) => {
  try {
    console.log("getAllProducts");

    const search = req.query.search ? String(req.query.search) : "";

    const productCollectionParam = req.query.productCollection
      ? String(req.query.productCollection)
      : undefined;

    const orderQuery = (req.query.order || "new").toString().toLowerCase();
    const order: ProductInquiry["order"] =
      orderQuery === "price_low"
        ? "PRICE_ASC"
        : orderQuery === "price_high"
          ? "PRICE_DESC"
          : orderQuery === "top_rated"
            ? "TOP_RATED"
            : "NEWEST";

    const page = Number(req.query.page) || 1;
    const limit = 10;

    const userId = req.user?._id ? shapeIntoMongooseObjectId(req.user._id) : undefined;

    const { products, total } = await productService.getAllProducts({
      page,
      limit,
      search,
      order,
      productCollection: productCollectionParam
        ? ProductCollection[
            productCollectionParam as keyof typeof ProductCollection
          ]
        : undefined,
      userId,
    });

    const totalPages = Math.ceil(total / limit);

    res.render("products", {
      products,
      search,
      productCollection: productCollectionParam,
      order: orderQuery,
      currentPage: page,
      totalPages,
    });

  } catch (err) {
    console.log("Error, getAllProducts:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};


productController.addProduct = async (req: SellerRequest, res: Response) => {
  try {
    console.log("========== ADD PRODUCT START ==========");

    if (!req.user) {
      throw new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);
    }

    if (!req.files?.length) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }

    const data: ProductInput = {
      ...req.body,
      userId: shapeIntoMongooseObjectId(req.user._id),
      productImages: req.files.map((file) =>
        file.path.replace(/\\/g, "/")
      ),
      productPrice: Number(req.body.productPrice),
      productStock: Number(req.body.productStock),
    };

    console.log("FINAL PRODUCT DATA:", {
      productName: data.productName,
      userId: data.userId,
      productPrice: data.productPrice,
      productCollection: data.productCollection,
      imagesCount: data.productImages?.length,
    });

    const created = await productService.addProduct(data);

    console.log("PRODUCT CREATED:", {
      _id: created._id,
      userId: created.userId,
    });

    res.send(`
      <script>
        alert("Successfully added product");
        window.location.replace('/seller/products');
      </script>
    `);

  } catch (err) {
    console.error("ERROR addProduct:", err);

    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;

    res.send(`
      <script>
        alert("${message}");
        window.location.replace('/seller/product/add');
      </script>
    `);
  }
};



productController.getUpdateProduct = async (req: Request, res: Response) => {
    try {
        console.log("getUpdateProduct");
        const id = req.params.id;
        
        // Servicedan ID bo'yicha ma'lumotni olamiz
        const result = await productService.getProductDetail(id);

        // productDetail.ejs ga yuboramiz
        res.render("productDetail", { product: result });
        
    } catch (err) {
        console.log("Error getUpdateProduct:", err);
        res.redirect("/seller/products");
    }
};


productController.updateChosenProduct = async (req: Request, res: Response) => {
  try {
    console.log("updateChosenProduct");
    const id = req.params.id;

    // 1. Eski productni olib kelamiz
    const oldProduct = await productService.getProductById(id);

    // 2. Yangi fayllar
    const newFiles = req.files && Array.isArray(req.files) ? req.files : [];
    
    // 3. Qaysi indeksdagi rasmlar o'zgarishi kerakligini olamiz
    // Frontenddan "0,2" kabi string keladi
    let indexes: number[] = [];
    if (req.body.imageIndexes) {
        indexes = req.body.imageIndexes.split(',').map((i: string) => Number(i));
    }

    // 4. MANTIQ: Eski rasmlardan nusxa olamiz va keraklilarini almashtiramiz
    let finalImages = [...oldProduct.productImages];

    // Har bir yangi faylni o'z joyiga qo'yamiz
    newFiles.forEach((file: any, i: number) => {
        const targetIndex = indexes[i]; // Bu fayl qaysi joyga tegishli?
        
        // Agar indeks to'g'ri bo'lsa va 5 ta rasm limitidan oshmasa
        if (targetIndex >= 0 && targetIndex < 5) {
            finalImages[targetIndex] = file.path;
        } else {
            // Agar indeks topilmasa (xatolik bo'lsa), shunchaki qo'shib qo'yamiz
            finalImages.push(file.path);
        }
    });

    // 5. Inputni tayyorlash
    const input: any = {
      productName: req.body.productName,
      productDesc: req.body.productDesc,
      productStatus: req.body.productStatus,
      productCollection: req.body.productCollection,
      productType: req.body.productType,
      productImages: finalImages, // O'zgargan array
    };

    // Number maydonlar
    if (req.body.productPrice !== undefined) input.productPrice = Number(req.body.productPrice);
    if (req.body.productStock !== undefined) input.productStock = Number(req.body.productStock);

    // 6. Update
    await productService.updateChosenProduct(id, input);

    res.redirect("/seller/products");

  } catch (err) {
    console.log("Error , updateChosenProduct", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};


productController.updateProductStatus = async (req: Request, res: Response) => {
        try {
            console.log("Status update request:", req.body);
            const { id, productStatus } = req.body;

            // Servis orqali yangilash
            const result = await productService.updateProductStatus(id, productStatus);

            // Frontga "OK" deb javob qaytarish (muhim!)
            res.json({ state: "success", data: result });
        } catch (err) {
            console.log("ERROR updateProductStatus:", err);
            if (err instanceof Errors) res.status(err.code).json(err);
            else res.status(Errors.standard.code).json(Errors.standard);
        }
    };

    

// SSR APIs

productController.getProducts = async (req: Request, res: Response) => {
  try {
    console.log("getProducts function triggered");
    
  
    const { page, limit, order, productCollection, search } = req.query;
    const inquiry: ProductInquiry = {
      order: String(order),
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    };
    if (productCollection) {
      inquiry.productCollection = productCollection as ProductCollection;
    }
    if (search) {
      inquiry.search = String(search);
    }
    const result = await productService.getProducts(inquiry);

    res.status(HttpCode.OK).json(result);
    
  } catch (err) {
    console.log("Error, getProducts:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

productController.getRecommendedProducts = async (req: ExtendedRequest, res: Response) => {
  try {
    console.log("getRecommendedProducts");

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
    const debugParam = String(req.query.debug ?? "").toLowerCase();
    const debug = debugParam === "1" || debugParam === "true";

    const rawUserId = extractUserIdFromReq(req);
    const userId = rawUserId ? shapeIntoMongooseObjectId(rawUserId) : null;

    const result = await productService.getRecommendedProducts(userId, { page, limit });

    const response: any = {
      success: true,
      message: "Recommended products fetched successfully",
      data: {
        products: result.products,
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasNextPage: result.hasNextPage,
      },
    };

    if (debug) {
      response.recommendationType = result.recommendationType;
      response.signals = result.signals;
    }

    res.status(HttpCode.OK).json(response);
  } catch (err) {
    console.log("Error, getRecommendedProducts:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

productController.getSimilarProducts = async (req: Request, res: Response) => {
  try {
    console.log("getSimilarProducts");

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 10), 50);
    const debugParam = String(req.query.debug ?? "").toLowerCase();
    const debug = debugParam === "1" || debugParam === "true";

    const result = await productService.getSimilarProducts(req.params.id, { page, limit });

    const response: any = {
      success: true,
      message: "Similar products fetched successfully",
      data: {
        products: result.products,
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasNextPage: result.hasNextPage,
      },
    };

    if (debug) {
      response.recommendationType = result.recommendationType;
      response.signals = result.signals;
    }

    res.status(HttpCode.OK).json(response);
  } catch (err) {
    console.log("Error, getSimilarProducts:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};



function extractUserIdFromReq(req: ExtendedRequest): string | null {
  const session = (req as any).session;
  const user = req.user ?? session?.user ?? null;
  if (!user) return null;
  let rawId = user._id;
  if (rawId == null && (user as any).id != null) rawId = (user as any).id;
  if (rawId == null) return null;
  if (typeof rawId === "string") return rawId;
  if (typeof rawId === "object" && rawId !== null && "toString" in rawId) return rawId.toString();
  if (typeof rawId === "object" && (rawId as any).$oid) return (rawId as any).$oid;
  return null;
}

productController.getProduct = async (req: ExtendedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rawUserId = extractUserIdFromReq(req);
    const userId = rawUserId != null ? shapeIntoMongooseObjectId(rawUserId) : null;
    if (!userId && (req.user || (req as any).session?.user)) {
      console.warn("[getProduct] auth present but no userId – req.user:", !!req.user, "session.user:", !!((req as any).session?.user), "user keys:", req.user ? Object.keys(req.user) : (req as any).session?.user ? Object.keys((req as any).session.user) : []);
    }
    const result = await productService.getProduct(userId, id);
    res.send(result);
  } catch (err) {
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};


export default productController