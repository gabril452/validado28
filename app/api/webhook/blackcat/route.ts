import { type NextRequest, NextResponse } from "next/server"
import type { BlackCatWebhookPayload } from "@/lib/blackcat"
import { sendOrderToUtmfy, formatUtmfyDate, mapBlackCatStatusToUtmfy, type UtmfyOrderRequest } from "@/lib/utmfy"

export async function POST(request: NextRequest) {
  try {
    const payload: BlackCatWebhookPayload = await request.json()

    console.log("[BlackCat Webhook] ====== WEBHOOK RECEBIDO ======")
    console.log("[BlackCat Webhook] Tipo:", payload.type)
    console.log("[BlackCat Webhook] ObjectId:", payload.objectId)
    console.log("[BlackCat Webhook] Status:", payload.data.status)
    console.log("[BlackCat Webhook] Amount:", payload.data.amount / 100, "BRL")
    console.log("[BlackCat Webhook] PaidAt:", payload.data.paidAt)
    console.log("[BlackCat Webhook] Payload completo:", JSON.stringify(payload, null, 2))
    console.log("[BlackCat Webhook] ==============================")

    // Only process transaction updates
    if (payload.type !== "transaction") {
      console.log("[BlackCat Webhook] Ignorando - tipo não é transaction")
      return NextResponse.json({ received: true })
    }

    const transaction = payload.data

    // Parse metadata to get original order info
    let metadata: {
      orderId: string
      trackingParams: Record<string, string | null>
      shipping: { price: number } | null
      createdAt: string
    } | null = null

    try {
      metadata = transaction.metadata ? JSON.parse(transaction.metadata) : null
      console.log("[BlackCat Webhook] Metadata parseado:", metadata?.orderId)
      console.log("[BlackCat Webhook] Tracking params:", JSON.stringify(metadata?.trackingParams))
    } catch {
      console.error("[BlackCat Webhook] Falha ao parsear metadata")
    }

    const orderId = metadata?.orderId || transaction.externalRef || String(transaction.id)
    const trackingParams = metadata?.trackingParams || {}
    const createdAt = metadata?.createdAt || transaction.createdAt

    // Calculate fees
    const gatewayFeeInCents = transaction.fee?.estimatedFee || Math.round(100 + transaction.amount * 0.015)
    const userCommissionInCents = transaction.amount - gatewayFeeInCents

    // Map status to UTMFY format
    const utmfyStatus = mapBlackCatStatusToUtmfy(transaction.status)
    console.log("[BlackCat Webhook] Status mapeado:", transaction.status, "->", utmfyStatus)

    let approvedDate: string | null = null
    if (utmfyStatus === "paid" || transaction.status === "approved" || transaction.status === "paid") {
      approvedDate = transaction.paidAt ? formatUtmfyDate(transaction.paidAt) : formatUtmfyDate(new Date())
      console.log("[BlackCat Webhook] *** VENDA APROVADA! *** Data:", approvedDate)
    }

    // Prepare UTMFY order update
    const utmfyOrder: UtmfyOrderRequest = {
      orderId,
      platform: "CometaPapelaria",
      paymentMethod: "pix",
      status: utmfyStatus,
      createdAt: formatUtmfyDate(createdAt)!,
      approvedDate,
      refundedAt: transaction.refundedAt ? formatUtmfyDate(transaction.refundedAt) : null,
      customer: {
        name: transaction.customer.name,
        email: transaction.customer.email,
        phone: transaction.customer.phone,
        document: transaction.customer.document.number,
        country: "BR",
        ip: transaction.ip || undefined,
      },
      products: transaction.items.map((item) => ({
        id: item.externalRef,
        name: item.title,
        planId: null,
        planName: null,
        quantity: item.quantity,
        priceInCents: item.unitPrice * item.quantity,
      })),
      trackingParameters: {
        src: trackingParams.src || null,
        sck: trackingParams.sck || null,
        utm_source: trackingParams.utm_source || null,
        utm_campaign: trackingParams.utm_campaign || null,
        utm_medium: trackingParams.utm_medium || null,
        utm_content: trackingParams.utm_content || null,
        utm_term: trackingParams.utm_term || null,
      },
      commission: {
        totalPriceInCents: transaction.amount,
        gatewayFeeInCents,
        userCommissionInCents,
        currency: "BRL",
      },
      isTest: false,
    }

    // Send update to UTMFY
    console.log("[BlackCat Webhook] ====== ENVIANDO PARA UTMFY ======")
    console.log("[BlackCat Webhook] OrderId:", orderId)
    console.log("[BlackCat Webhook] Status:", utmfyStatus)
    console.log("[BlackCat Webhook] ApprovedDate:", approvedDate)
    console.log("[BlackCat Webhook] Dados completos:", JSON.stringify(utmfyOrder, null, 2))

    const result = await sendOrderToUtmfy(utmfyOrder)

    if (result.success) {
      console.log("[BlackCat Webhook] *** SUCESSO *** Pedido atualizado na UTMFY:", orderId, "->", utmfyStatus)
    } else {
      console.error("[BlackCat Webhook] *** FALHA *** ao enviar para UTMFY:", result.error)
    }

    return NextResponse.json({
      received: true,
      status: transaction.status,
      utmfyStatus,
      utmfySent: result.success,
      orderId,
      approvedDate,
    })
  } catch (error) {
    console.error("[BlackCat Webhook] Erro completo:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
