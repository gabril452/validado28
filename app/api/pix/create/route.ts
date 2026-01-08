import { type NextRequest, NextResponse } from "next/server"
import { createPixTransaction, type BlackCatTransactionRequest } from "@/lib/blackcat"
import { sendOrderToUtmfy, formatUtmfyDate, type UtmfyOrderRequest } from "@/lib/utmfy"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log("===========================================")
    console.log("[PIX Create] INICIANDO CRIAÇÃO DE PIX")
    console.log("===========================================")

    console.log("[PIX Create] Verificando variáveis de ambiente...")
    console.log(
      "[PIX Create] BLACKCAT_PUBLIC_KEY:",
      process.env.BLACKCAT_PUBLIC_KEY
        ? "Configurada (" + process.env.BLACKCAT_PUBLIC_KEY.substring(0, 10) + "...)"
        : "NÃO CONFIGURADA",
    )
    console.log(
      "[PIX Create] BLACKCAT_SECRET_KEY:",
      process.env.BLACKCAT_SECRET_KEY ? "Configurada" : "NÃO CONFIGURADA",
    )
    console.log("[PIX Create] NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL || "NÃO CONFIGURADA")

    if (!process.env.BLACKCAT_PUBLIC_KEY || !process.env.BLACKCAT_SECRET_KEY) {
      console.error("[PIX Create] ERRO: Chaves da Black Cat não configuradas!")
      return NextResponse.json(
        {
          error:
            "Configuração incompleta: As chaves da API de pagamento não estão configuradas. Adicione BLACKCAT_PUBLIC_KEY e BLACKCAT_SECRET_KEY nas variáveis de ambiente.",
          missingKeys: {
            publicKey: !process.env.BLACKCAT_PUBLIC_KEY,
            secretKey: !process.env.BLACKCAT_SECRET_KEY,
          },
        },
        { status: 500 },
      )
    }

    console.log(
      "[PIX Create] Recebendo requisição:",
      JSON.stringify({
        hasCustomer: !!body.customer,
        hasAddress: !!body.address,
        itemsCount: body.items?.length,
        hasShipping: !!body.shipping,
        hasTrackingParams: !!body.trackingParams,
      }),
    )

    const { customer, address, items, shipping, trackingParams, metadata } = body

    // Validate required fields
    if (!customer || !address || !items || items.length === 0) {
      console.log("[PIX Create] Dados incompletos:", { customer: !!customer, address: !!address, items: items?.length })
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
    }

    if (!customer.name || !customer.email || !customer.phone || !customer.cpf) {
      console.log("[PIX Create] Dados do cliente incompletos:", {
        name: !!customer.name,
        email: !!customer.email,
        phone: !!customer.phone,
        cpf: !!customer.cpf,
      })
      return NextResponse.json(
        { error: "Dados do cliente incompletos. Preencha todos os campos obrigatórios." },
        { status: 400 },
      )
    }

    if (
      !address.cep ||
      !address.street ||
      !address.number ||
      !address.neighborhood ||
      !address.city ||
      !address.state
    ) {
      console.log("[PIX Create] Dados de endereço incompletos:", {
        cep: !!address.cep,
        street: !!address.street,
        number: !!address.number,
        neighborhood: !!address.neighborhood,
        city: !!address.city,
        state: !!address.state,
      })
      return NextResponse.json(
        { error: "Dados de endereço incompletos. Preencha todos os campos obrigatórios." },
        { status: 400 },
      )
    }

    const sanitizedPhone = String(customer.phone || "").replace(/\D/g, "")
    const sanitizedCpf = String(customer.cpf || "").replace(/\D/g, "")
    const sanitizedCep = String(address.cep || "").replace(/\D/g, "")

    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      return NextResponse.json({ error: "Telefone inválido. Informe um número válido com DDD." }, { status: 400 })
    }

    if (!sanitizedCpf || sanitizedCpf.length !== 11) {
      return NextResponse.json({ error: "CPF inválido. Informe um CPF válido com 11 dígitos." }, { status: 400 })
    }

    if (!sanitizedCep || sanitizedCep.length !== 8) {
      return NextResponse.json({ error: "CEP inválido. Informe um CEP válido com 8 dígitos." }, { status: 400 })
    }

    const subtotalInCents = items.reduce(
      (sum: number, item: { price: number; quantity: number }) => sum + Math.round(item.price * 100) * item.quantity,
      0,
    )

    const pixDiscountInCents = Math.round(subtotalInCents * 0.05)
    const shippingInCents = shipping?.price ? Math.round(shipping.price * 100) : 0
    const totalInCents = subtotalInCents - pixDiscountInCents + shippingInCents

    console.log("[PIX Create] Valores calculados:", {
      subtotal: subtotalInCents / 100,
      desconto: pixDiscountInCents / 100,
      frete: shippingInCents / 100,
      total: totalInCents / 100,
    })

    // Get client IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown"

    // Generate unique order ID
    const orderId = `COM${Date.now().toString().slice(-8)}`

    // Calculate expiration date (30 minutes from now)
    const expirationDate = new Date()
    expirationDate.setMinutes(expirationDate.getMinutes() + 30)
    const expirationDateStr = expirationDate.toISOString().split("T")[0]

    const transactionRequest: BlackCatTransactionRequest = {
      amount: totalInCents,
      currency: "BRL",
      paymentMethod: "pix",
      pix: {
        expirationDate: expirationDateStr,
      },
      items: items.map((item: { id: string; name: string; price: number; quantity: number }) => ({
        externalRef: String(item.id || ""),
        title: String(item.name || "Produto"),
        unitPrice: Math.round(item.price * 100),
        quantity: item.quantity,
        tangible: true,
      })),
      customer: {
        name: String(customer.name || ""),
        email: String(customer.email || ""),
        phone: sanitizedPhone,
        document: {
          number: sanitizedCpf,
          type: "cpf",
        },
        address: {
          street: String(address.street || ""),
          streetNumber: String(address.number || ""),
          complement: address.complement ? String(address.complement) : undefined,
          zipCode: sanitizedCep,
          neighborhood: String(address.neighborhood || ""),
          city: String(address.city || ""),
          state: String(address.state || ""),
          country: "BR",
        },
      },
      postbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com"}/api/webhook/blackcat`,
      externalRef: orderId,
      metadata: JSON.stringify({
        orderId,
        trackingParams,
        shipping,
        subtotalInCents,
        pixDiscountInCents,
        shippingInCents,
        totalInCents,
        createdAt: new Date().toISOString(),
      }),
      ip,
    }

    // Create transaction in Black Cat
    console.log("[PIX Create] Criando transação na Black Cat...")

    const transaction = await createPixTransaction(transactionRequest)

    console.log("[PIX Create] Transação criada:", {
      id: transaction.id,
      status: transaction.status,
      hasQrCode: !!transaction.pix?.qrcode,
    })

    // Calculate fees (estimated: R$1.00 fixed + 1.5% of total)
    const gatewayFeeInCents = Math.round(100 + totalInCents * 0.015)
    const userCommissionInCents = totalInCents - gatewayFeeInCents

    console.log("===========================================")
    console.log("[PIX Create] ENVIANDO PARA UTMFY...")
    console.log("===========================================")

    const utmfyOrder: UtmfyOrderRequest = {
      orderId,
      platform: "CometaPapelaria",
      paymentMethod: "pix",
      status: "waiting_payment",
      createdAt: formatUtmfyDate(new Date())!,
      approvedDate: null,
      refundedAt: null,
      customer: {
        name: String(customer.name || ""),
        email: String(customer.email || ""),
        phone: sanitizedPhone,
        document: sanitizedCpf,
        country: "BR",
        ip,
      },
      products: items.map((item: { id: string; name: string; price: number; quantity: number }) => ({
        id: String(item.id || ""),
        name: String(item.name || "Produto"),
        planId: null,
        planName: null,
        quantity: item.quantity,
        priceInCents: Math.round(item.price * 100) * item.quantity,
      })),
      trackingParameters: {
        src: trackingParams?.src || null,
        sck: trackingParams?.sck || null,
        utm_source: trackingParams?.utm_source || null,
        utm_campaign: trackingParams?.utm_campaign || null,
        utm_medium: trackingParams?.utm_medium || null,
        utm_content: trackingParams?.utm_content || null,
        utm_term: trackingParams?.utm_term || null,
      },
      commission: {
        totalPriceInCents: totalInCents,
        gatewayFeeInCents,
        userCommissionInCents,
        currency: "BRL",
      },
      isTest: false, // Mudado para false para enviar como pedido real
    }

    // Aguardar o resultado do envio para UTMFY
    const utmfyResult = await sendOrderToUtmfy(utmfyOrder)

    console.log("===========================================")
    console.log("[PIX Create] RESULTADO UTMFY:", JSON.stringify(utmfyResult))
    console.log("===========================================")

    // Return response with PIX data
    return NextResponse.json({
      success: true,
      orderId,
      transactionId: transaction.id,
      pix: {
        qrcode: transaction.pix?.qrcode,
        expirationDate: transaction.pix?.expirationDate,
      },
      secureUrl: transaction.secureUrl,
      status: transaction.status,
      calculatedValues: {
        subtotal: subtotalInCents / 100,
        pixDiscount: pixDiscountInCents / 100,
        shipping: shippingInCents / 100,
        total: totalInCents / 100,
      },
      utmfy: utmfyResult, // Adicionando resultado da UTMFY na resposta
    })
  } catch (error) {
    console.error("[PIX Create] Erro completo:", error)
    console.error("[PIX Create] Stack:", error instanceof Error ? error.stack : "N/A")
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar pagamento" },
      { status: 500 },
    )
  }
}
