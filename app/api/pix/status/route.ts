import { type NextRequest, NextResponse } from "next/server"
import { getTransaction } from "@/lib/blackcat"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get("transactionId")

    if (!transactionId) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 })
    }

    const transaction = await getTransaction(Number(transactionId))

    return NextResponse.json({
      status: transaction.status,
      paidAt: transaction.paidAt,
      paidAmount: transaction.paidAmount,
    })
  } catch (error) {
    console.error("[PIX Status] Error:", error)
    return NextResponse.json({ error: "Failed to get transaction status" }, { status: 500 })
  }
}
