import { NextResponse } from "next/server";
import { getLowestPrice, getHighestPrice, getAveragePrice, getEmailNotifType } from "@/lib/utils";
import { connectToDB } from "@/lib/mongoose";
import ProductModel from "@/lib/models/product.model";
import { scrapeAmazonProduct } from "@/lib/scraper";
import { generateEmailBody, sendEmail } from "@/lib/nodemailer";
import { Product, EmailProductInfo, User, NotificationType } from "@/types";  // Assuming this is the path for the types

export const maxDuration = 300; // This function can run for a maximum of 300 seconds
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    connectToDB();

    // Use Product type for the array of products
    const products = await ProductModel.find<Product>({});

    if (!products) throw new Error("No product found");

    // 1. Scrape the latest product details & update the DB
    const updatedProducts = await Promise.all(
      products.map(async (currentProduct: Product) => {
        // Scrape product
        const scrapedProduct = await scrapeAmazonProduct(currentProduct.url);

        if (!scrapedProduct) return;

        const updatedPriceHistory = [
          ...currentProduct.priceHistory,
          {
            price: scrapedProduct.currentPrice,
          },
        ];

        const product: Product = {
          ...scrapedProduct,
          priceHistory: updatedPriceHistory,
          lowestPrice: getLowestPrice(updatedPriceHistory),
          highestPrice: getHighestPrice(updatedPriceHistory),
          averagePrice: getAveragePrice(updatedPriceHistory),
          users: currentProduct.users, // Keep the users info from the current product
        };

        // Update products in the DB
        const updatedProduct = await ProductModel.findOneAndUpdate(
          { url: product.url },
          product,
          { new: true }  // Return the updated product
        );

        // 2. Check each product's status & send email notifications accordingly
        const emailNotifType = getEmailNotifType(
          scrapedProduct,
          currentProduct
        );

        if (emailNotifType && updatedProduct?.users?.length > 0) {
          const productInfo: EmailProductInfo = {
            title: updatedProduct.title,
            url: updatedProduct.url,
          };
          // Construct email content
          const emailContent = await generateEmailBody(productInfo, emailNotifType);
          // Get array of user emails
          const userEmails = updatedProduct.users.map((user: User) => user.email);
          // Send email notification
          await sendEmail(emailContent, userEmails);
        }

        return updatedProduct;
      })
    );

    return NextResponse.json({
      message: "Ok",
      data: updatedProducts,
    });
  } catch (error: any) {
    throw new Error(`Failed to get all products: ${error.message}`);
  }
}
