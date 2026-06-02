import { ProductCollection, ProductGender, ProductSort, ProductStatus, ProductType, ProductUnit } from "../libs/enums/product.enums"
import { shapeIntoMongooseObjectId } from "../libs/config"
import { Errors, HttpCode, Message } from "../libs/Errors"
import {
    Product,
    ProductAISearchFilters,
    ProductInput,
    ProductInquiry,
    ProductRecommendationResult,
    ProductRecommendationSignals,
    ProductRecommendationType,
    ProductUpdateInput
} from "../libs/types/product"
import ProductModel from "../schema/Product.model"
import { T } from "../libs/types/common"
import { Types } from "mongoose"
import { ViewInput } from "../libs/types/view"
import { ViewGroup } from "../libs/enums/view.enums"
import ViewModel from "../schema/View.model"
import ViewService from "./View.service"
import ProductAISearchService from "./ProductAISearch.service"
import OrderModel from "../schema/Order.model"
import OrderItemModel from "../schema/OrderItem.model"

class ProductService {
    private readonly productModel;
    public viewService;
    private readonly aiSearchService;
    private readonly orderModel;
    private readonly orderItemModel;

    constructor(){
        this.productModel = ProductModel;
        this.viewService = new ViewService()
        this.aiSearchService = new ProductAISearchService()
        this.orderModel = OrderModel;
        this.orderItemModel = OrderItemModel;
    };
     
    // BSSR APIs
public async addProduct(input: ProductInput): Promise<Product> {
  try {
    const result = await this.productModel.create(input);

    const product = result.toObject();

    console.log("PRODUCT CREATED (DB RESULT):", {
      _id: product._id,
      userId: product.userId,
      productName: product.productName
    });

    return product as Product;

  } catch (err) {
    console.log("Error, Service.model addProduct", err);
    throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
  }
}




    public async getAllProducts(inquiry: ProductInquiry) {
        // 1. Match (Filter) yasash
        const match: any = { productStatus: { $ne: "DELETE" } }; // O'chirilganlarni ko'rsatma

        if (inquiry.userId) {
            match.userId = inquiry.userId;
        }

        if (inquiry.productCollection) {
            match.productCollection = inquiry.productCollection;
        }

        if (inquiry.search) {
            match.productName = { $regex: new RegExp(inquiry.search, "i") };
        }

        // 2. Sort (Tartiblash) yasash
        let sort: Record<string, 1 | -1>;
            switch (inquiry.order) {
            case "PRICE_ASC":
                sort = { productPrice: 1 };
                break;

            case "PRICE_DESC":
                sort = { productPrice: -1 };
                break;

            case "TOP_RATED":
                sort = { productRating: -1 };
                break;

            case "NEWEST":
            default:
                sort = { createdAt: -1 };
            }


        // 3. Aggregation
        const result = await this.productModel.aggregate([
            { $match: match },
            { $sort: sort },
            {
                $facet: {
                    // a) Ro'yxat (Pagination bilan)
                    list: [
                        { $skip: (inquiry.page - 1) * inquiry.limit }, // Nechtasini o'tkazib yuborish
                        { $limit: inquiry.limit }, // Nechtasini olish
                    ],
                    // b) Umumiy soni (Pagination uchun)
                    metaData: [{ $count: "total" }],
                },
            },
        ]);

        // 4. Natijani ajratib olish
        // $facet natijasi array ichida array bo'lib qaytadi
        const products = result[0].list;
        const total = result[0].metaData.length > 0 ? result[0].metaData[0].total : 0;

        return { products, total };
    };


    public async getSellerProductsCount(userId: Types.ObjectId): Promise<number> {
        return await this.productModel.countDocuments({
            userId,
            productStatus: { $ne: "DELETE" }
        });
    }

    public async getSellerProducts(sellerId: Types.ObjectId, limit: number = 20): Promise<Product[]> {
        const result = await this.productModel
            .find({ userId: sellerId, productStatus: { $ne: "DELETE" } })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec();
        return result as Product[];
    }

    public async getProductDetail(id: string): Promise<Product> {
        const result = await this.productModel.findById(id).lean();
        if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
        return result as unknown as Product;
    };


    public async getProductById(id: string): Promise<Product> {
        const product = await this.productModel.findById(id);
        if (!product) throw new Errors(HttpCode.NOT_FOUND, Message.NOT_FOUND);
        return product.toObject() as Product;
    };


    public async updateChosenProduct(id: string, input: any): Promise<Product> {
        // id orqali topib, input ma'lumotlarini yangilaydi
        // { new: true } -> yangilangan ma'lumotni qaytaradi
        const result = await this.productModel.findByIdAndUpdate(id, input, { new: true });
        
        if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.UPDATE_FAILED);
        return result.toObject() as Product;
    };

    public async updateProductStatus(id: string, status: string): Promise<any> {
        // Status enum ekanligini tekshirish (ixtiyoriy)
        // const search: ProductInput = { productStatus: status }; 
        
        return await ProductModel.findByIdAndUpdate(id, { productStatus: status }, { new: true });
    };
    


    // SSR APIs
    public async aiSearchProducts(rawQuery: string, options?: { page?: number; limit?: number }): Promise<Product[]> {
        const filters = this.aiSearchService.parseFilters(rawQuery);
        const match: T = { productStatus: ProductStatus.ACTIVE };

        if (filters.category) {
            match.productCollection = filters.category;
        }

        if (filters.minPrice != null || filters.maxPrice != null) {
            match.productPrice = {};
            if (filters.minPrice != null) match.productPrice.$gte = filters.minPrice;
            if (filters.maxPrice != null) match.productPrice.$lte = filters.maxPrice;
        }

        const terms = this.buildSearchTerms(filters);
        if (terms.length > 0) {
            const pattern = new RegExp(terms.map((term) => this.escapeRegex(term)).join("|"), "i");
            match.$or = [
                { productName: { $regex: pattern } },
                { productDesc: { $regex: pattern } },
            ];
        }

        const sort = this.buildAiSearchSort(filters.sort);
        const page = options?.page && options.page > 0 ? options.page : 1;
        const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;

        const result = await this.productModel
            .find(match)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean()
            .exec();

        return result as Product[];
    }

    public async getRecommendedProducts(
        userId: Types.ObjectId | null,
        options?: { page?: number; limit?: number }
    ): Promise<ProductRecommendationResult> {
        const { page, limit } = this.normalizePagination(options);

        if (!userId) {
            return await this.getFallbackRecommendations(page, limit);
        }

        const [viewIds, purchasedIds] = await Promise.all([
            this.getRecentViewProductIds(userId, 25),
            this.getPurchasedProductIds(userId, 100),
        ]);

        const signalIds = this.dedupeObjectIds([...viewIds, ...purchasedIds]);
        if (signalIds.length < 2) {
            return await this.getFallbackRecommendations(page, limit);
        }

        const signalProducts = await this.productModel
            .find({ _id: { $in: signalIds }, productStatus: ProductStatus.ACTIVE })
            .lean()
            .exec();

        if (signalProducts.length < 2) {
            return await this.getFallbackRecommendations(page, limit);
        }

        const signals = this.buildRecommendationSignals(signalProducts as Product[]);
        if (!this.hasSignals(signals)) {
            return await this.getFallbackRecommendations(page, limit);
        }

        const excludeIds = this.dedupeObjectIds(purchasedIds);
        return await this.getScoredRecommendations(
            signals,
            excludeIds,
            page,
            limit,
            "personalized"
        );
    }

    public async getSimilarProducts(
        productId: string,
        options?: { page?: number; limit?: number }
    ): Promise<ProductRecommendationResult> {
        const { page, limit } = this.normalizePagination(options);
        const targetId = shapeIntoMongooseObjectId(productId);

        const target = await this.productModel
            .findOne({ _id: targetId, productStatus: ProductStatus.ACTIVE })
            .lean()
            .exec();

        if (!target) {
            throw new Errors(HttpCode.NOT_FOUND, Message.NO_PRODUCT_FOUND);
        }

        const signals = this.buildRecommendationSignals([target as Product]);
        const excludeIds = this.dedupeObjectIds([target._id]);

        return await this.getScoredRecommendations(
            signals,
            excludeIds,
            page,
            limit,
            "similar"
        );
    }

 public async getProducts(inquery:ProductInquiry): Promise<Product[]> {
    const match: T = {productStatus: ProductStatus.ACTIVE};
    if(inquery.productCollection)
        match.productCollection = inquery.productCollection;
    if(inquery.search) {
        // match.productName = inquery.search
        match.productName = { $regex: new RegExp(inquery.search, "i")}
    }

    const orderField = inquery.order ?? "createdAt";

    const sort: T = orderField === "productPrice" 
    ? {[orderField]: 1} 
    : {[orderField]: -1};

    const result = await this.productModel.aggregate([
        {$match: match},
        {$sort: sort},
        {$skip: (inquery.page * 1 - 1) * inquery.limit},
        {$limit: inquery.limit * 1},
    ]).exec();
    if(!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
};


    public async getProduct(userId: Types.ObjectId | null, id: string): Promise<Product>{
        const productId = shapeIntoMongooseObjectId(id);
        console.log("[getProduct] productId", productId, "userId", userId);

        let result =  await this.productModel.findOne({_id: productId, productStatus: ProductStatus.ACTIVE}).lean<Product>().exec();
        if(!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_PRODUCT_FOUND);

        if(userId){
            const input: ViewInput = {
                userId: userId,
                viewRefId: productId,
                viewGroup: ViewGroup.PRODUCT,
            };
            console.log("[getProduct] checking view existence", { userId, productId, viewGroup: ViewGroup.PRODUCT });

            const existView = await this.viewService.checkViewExistance(input);
            console.log("[getProduct] existView", !!existView, existView ? "viewId:" + existView._id : "none");

            if(!existView){
                console.log("[getProduct] new view – inserting and incrementing productViews");
                await this.viewService.insertUserView(input);
                console.log("[getProduct] view inserted, incrementing productViews for", productId);

                const updated = await this.productModel.findByIdAndUpdate(
                    productId,
                    { $inc: { productViews: 1 } },
                    { new: true }
                )
                    .lean<Product>()
                    .exec();
                if (updated) {
                    console.log("[getProduct] productViews incremented, new count:", updated.productViews);
                    result = updated;
                } else {
                    console.error("[getProduct] findByIdAndUpdate returned null for productId", productId);
                }
            } else {
                console.log("[getProduct] view already exists, skipping increment");
            }
        }
        return result;
    };

    private buildAiSearchSort(sort?: ProductSort): T {
        switch (sort) {
            case ProductSort.PRICE_LOW:
                return { productPrice: 1 };
            case ProductSort.PRICE_HIGH:
                return { productPrice: -1 };
            case ProductSort.TOP_RATED:
                return { productRating: -1 };
            case ProductSort.NEWEST:
            default:
                return { createdAt: -1 };
        }
    }

    private buildSearchTerms(filters: ProductAISearchFilters): string[] {
        const terms = new Set<string>();

        if (filters.keyword) {
            const keywordParts = filters.keyword.split(/\s+/).filter(Boolean);
            if (keywordParts.length > 0) keywordParts.forEach((part) => terms.add(part));
            else terms.add(filters.keyword);
        }

        if (filters.color) terms.add(filters.color);

        return Array.from(terms);
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    private normalizePagination(options?: { page?: number; limit?: number }) {
        const rawPage = Number(options?.page ?? 1);
        const rawLimit = Number(options?.limit ?? 10);
        const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
        const limit = Number.isFinite(rawLimit)
            ? Math.min(Math.max(rawLimit, 1), 50)
            : 10;
        return { page, limit, skip: (page - 1) * limit };
    }

    private dedupeObjectIds(ids: Array<Types.ObjectId | string>): Types.ObjectId[] {
        const unique = new Set<string>();
        const result: Types.ObjectId[] = [];
        ids.forEach((id) => {
            if (!id) return;
            const normalized = shapeIntoMongooseObjectId(id) as Types.ObjectId;
            const key = normalized.toString();
            if (!unique.has(key)) {
                unique.add(key);
                result.push(normalized);
            }
        });
        return result;
    }

    private buildRecommendationSignals(products: Product[]): ProductRecommendationSignals {
        const categories = new Set<ProductCollection>();
        const types = new Set<ProductType>();
        const genders = new Set<ProductGender>();
        const units = new Set<ProductUnit>();
        let priceSum = 0;
        let priceCount = 0;

        products.forEach((product) => {
            if (product.productCollection) categories.add(product.productCollection);
            if (product.productType) types.add(product.productType);
            if (product.productGender) genders.add(product.productGender);
            if (product.productUnit) units.add(product.productUnit);
            if (Number.isFinite(product.productPrice)) {
                priceSum += product.productPrice;
                priceCount += 1;
            }
        });

        const signals: ProductRecommendationSignals = {
            categories: Array.from(categories),
            types: Array.from(types),
            genders: Array.from(genders),
            units: Array.from(units),
        };

        if (priceCount > 0) {
            const avgPrice = priceSum / priceCount;
            signals.priceRange = {
                min: Math.max(0, avgPrice * 0.8),
                max: avgPrice * 1.2,
            };
        }

        return signals;
    }

    private hasSignals(signals: ProductRecommendationSignals): boolean {
        return (
            signals.categories.length > 0 ||
            signals.types.length > 0 ||
            signals.genders.length > 0 ||
            signals.units.length > 0 ||
            !!signals.priceRange
        );
    }

    private async getRecentViewProductIds(userId: Types.ObjectId, limit: number): Promise<Types.ObjectId[]> {
        const views = await ViewModel.find({
            userId,
            viewGroup: ViewGroup.PRODUCT,
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()
            .exec();

        const viewIds = views.map((view: any) => view.viewRefId);
        return this.dedupeObjectIds(viewIds);
    }

    private async getPurchasedProductIds(userId: Types.ObjectId, limit: number): Promise<Types.ObjectId[]> {
        const orderIds = await this.orderModel
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .distinct("_id");

        if (!orderIds.length) return [];

        const productIds = await this.orderItemModel.distinct("productId", {
            orderId: { $in: orderIds },
        });

        return this.dedupeObjectIds(productIds as Array<Types.ObjectId | string>).slice(0, limit);
    }

    private async getScoredRecommendations(
        signals: ProductRecommendationSignals,
        excludeIds: Types.ObjectId[],
        page: number,
        limit: number,
        recommendationType: ProductRecommendationType
    ): Promise<ProductRecommendationResult> {
        const match: T = { productStatus: ProductStatus.ACTIVE };
        if (excludeIds.length > 0) {
            match._id = { $nin: excludeIds };
        }

        const scoreParts: any[] = [];

        if (signals.categories.length > 0) {
            scoreParts.push({
                $cond: [{ $in: ["$productCollection", signals.categories] }, 5, 0],
            });
        }

        if (signals.types.length > 0) {
            scoreParts.push({
                $cond: [{ $in: ["$productType", signals.types] }, 3, 0],
            });
        }

        if (signals.genders.length > 0) {
            scoreParts.push({
                $cond: [{ $in: ["$productGender", signals.genders] }, 2, 0],
            });
        }

        if (signals.units.length > 0) {
            scoreParts.push({
                $cond: [{ $in: ["$productUnit", signals.units] }, 1, 0],
            });
        }

        if (signals.priceRange) {
            scoreParts.push({
                $cond: [
                    {
                        $and: [
                            { $gte: ["$productPrice", signals.priceRange.min] },
                            { $lte: ["$productPrice", signals.priceRange.max] },
                        ],
                    },
                    2,
                    0,
                ],
            });
        }

        const scoreExpression = scoreParts.length > 0 ? { $add: scoreParts } : 0;

        const pipeline: any[] = [
            { $match: match },
            { $addFields: { score: scoreExpression } },
            {
                $sort: {
                    score: -1,
                    productRating: -1,
                    productViews: -1,
                    productLikes: -1,
                    createdAt: -1,
                },
            },
            {
                $facet: {
                    list: [
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                        { $project: { score: 0 } },
                    ],
                    total: [{ $count: "count" }],
                },
            },
        ];

        const result = await this.productModel.aggregate(pipeline).exec();
        const products = result[0]?.list ?? [];
        const total = result[0]?.total?.[0]?.count ?? 0;
        const hasNextPage = page * limit < total;

        return {
            products: products as Product[],
            page,
            limit,
            total,
            hasNextPage,
            recommendationType,
            signals,
        };
    }

    private async getFallbackRecommendations(page: number, limit: number): Promise<ProductRecommendationResult> {
        const match: T = { productStatus: ProductStatus.ACTIVE };
        const total = await this.productModel.countDocuments(match);
        const products = await this.productModel
            .find(match)
            .sort({ productViews: -1, productRating: -1, productLikes: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean()
            .exec();

        return {
            products: products as Product[],
            page,
            limit,
            total,
            hasNextPage: page * limit < total,
            recommendationType: "fallback",
        };
    }

  
};


export default ProductService