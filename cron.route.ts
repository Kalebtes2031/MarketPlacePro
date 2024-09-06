
export const maxDuration = 600; // This function can run for a maximum of 300 seconds
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    
  } catch (error: any) {
    throw new Error(`Failed to get all products: ${error.message}`);
  }
}