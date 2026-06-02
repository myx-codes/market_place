import { Types } from "mongoose";
import {
  ProductStatus,
  ProductCollection,
  ProductType,
  ProductGender,
  ProductUnit,
  ProductSort
} from "../enums/product.enums";

export interface Product {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  productStatus: ProductStatus;
  productType: ProductType;
  productCollection: ProductCollection;
  productName: string;
  productDesc: string;
  productPrice: number;
  productDiscountPrice: number;
  productStock: number;
  productUnit: ProductUnit;
  productGender: ProductGender;
  productImages: string[];
  productViews: number;
  productLikes: number;
  productRating: number;
  createdAt: Date;
  updatedAt: Date;
}


export interface ProductInput {
  userId: Types.ObjectId;
  productCollection: ProductCollection;
  productName: string;
  productDesc: string;
  productPrice: number;
  productStock: number;
  productStatus?: ProductStatus;
  productType?: ProductType;
  productDiscountPrice?: number;
  productUnit?: ProductUnit;
  productGender?: ProductGender;
  productImages?: string[];
}


export interface ProductUpdateInput {
  _id: Types.ObjectId;

  productStatus?: ProductStatus;
  productCollection?: ProductCollection;
  productType?: ProductType;

  productName?: string;
  productDesc?: string;

  productPrice?: number;
  productDiscountPrice?: number;
  productStock?: number;

  productUnit?: ProductUnit;
  productGender?: ProductGender;
  productImages?: string[];
}


export interface ProductInquiry {
  order?: string;
  page: number;
  limit: number;
  productCollection?: ProductCollection;
  search?: string;
  userId?: Types.ObjectId;
}

export interface ProductAISearchFilters {
  keyword?: string;
  category?: ProductCollection;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
}

export type ProductRecommendationType = "personalized" | "fallback" | "similar";

export interface ProductRecommendationSignals {
  categories: ProductCollection[];
  types: ProductType[];
  genders: ProductGender[];
  units: ProductUnit[];
  priceRange?: {
    min: number;
    max: number;
  };
}

export interface ProductRecommendationResult {
  products: Product[];
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
  recommendationType: ProductRecommendationType;
  signals?: ProductRecommendationSignals;
}
