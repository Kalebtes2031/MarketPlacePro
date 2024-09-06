import { NextResponse } from "next/server";
import { getLowestPrice, getHighestPrice, getAveragePrice, getEmailNotifType } from "@/lib/utils";
import { connectToDB } from "@/lib/mongoose";
import Product from "@/lib/models/product.model";
import { scrapeAmazonProduct } from "@/lib/scraper";
import { generateEmailBody, sendEmail } from "@/lib/nodemailer";

export const maxDuration = 60; // This function can run for a maximum of 60 seconds
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  console.log("GET request received");

  try {
    console.log("Connecting to database...");
    await connectToDB();
    console.log("Database connected");

    console.log("Fetching products...");
    const products = await Product.find({});
    console.log(`Found ${products.length} products`);

    if (!products) throw new Error("No product fetched");

    console.log("Starting to scrape and update products...");
    const updatedProducts = await Promise.all(
      products.map(async (currentProduct) => {
        console.log(`Scraping product at URL: ${currentProduct.url}`);
        const scrapedProduct = await scrapeAmazonProduct(currentProduct.url);

        if (!scrapedProduct) {
          console.log(`No data scraped for URL: ${currentProduct.url}`);
          return;
        }

        const updatedPriceHistory = [
          ...currentProduct.priceHistory,
          {
            price: scrapedProduct.currentPrice,
          },
        ];

        const product = {
          ...scrapedProduct,
          priceHistory: updatedPriceHistory,
          lowestPrice: getLowestPrice(updatedPriceHistory),
          highestPrice: getHighestPrice(updatedPriceHistory),
          averagePrice: getAveragePrice(updatedPriceHistory),
        };

        console.log(`Updating product in DB for URL: ${product.url}`);
        const updatedProduct = await Product.findOneAndUpdate(
          { url: product.url },
          product,
          { new: true } // Ensure we get the updated document
        );

        console.log(`Checking email notifications for product: ${product.title}`);
        const emailNotifType = getEmailNotifType(scrapedProduct, currentProduct);

        if (emailNotifType && updatedProduct.users.length > 0) {
          const productInfo = {
            title: updatedProduct.title,
            url: updatedProduct.url,
          };
          console.log(`Generating email content for product: ${product.title}`);
          const emailContent = await generateEmailBody(productInfo, emailNotifType);
          const userEmails = updatedProduct.users.map((user: any) => user.email);
          console.log(`Sending email to ${userEmails.length} users`);
          await sendEmail(emailContent, userEmails);
        }

        return updatedProduct;
      })
    );

    console.log("Products updated successfully");
    return NextResponse.json({
      message: "Ok",
      data: updatedProducts,
    });
  } catch (error: any) {
    console.error(`Failed to get all products: ${error.message}`);
    return NextResponse.json({ error: `Failed to get all products: ${error.message}` }, { status: 500 });
  }
}
