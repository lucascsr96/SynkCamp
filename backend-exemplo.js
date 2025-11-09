const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = 4242;

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
let db;
try {
  // ⚠️ Pega a chave da variável de ambiente
  // (O conteúdo inteiro do .json que você baixou)
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  console.log("Firebase Admin inicializado com sucesso.");

} catch (e) {
  console.error('Falha ao inicializar Firebase Admin:', e);
  console.error('Verifique se a variável de ambiente FIREBASE_SERVICE_ACCOUNT está correta no Vercel.');
}
// --- FIM DA INICIALIZAÇÃO ---

// Parseia o JSON vindo do frontend
app.use(express.json());

// Pega a URL do seu site (frontend) das variáveis de ambiente
const DOMINIO_DO_SEU_SITE = process.env.FRONTEND_URL || 'http://localhost:4242';

// Configuração do CORS
app.use(cors({
  origin: [DOMINIO_DO_SEU_SITE, 'https://synk-camp.vercel.app'] 
}));

// Body parser para o checkout
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, userId } = req.body;

    // Validação
    if (!priceId || !userId) {
      console.warn("Chamada recebida sem priceId ou userId.");
      return res.status(400).send({ error: 'Price ID e User ID são obrigatórios.' });
    }

    console.log(`Criando sessão de checkout para userId: ${userId} e priceId: ${priceId}`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${DOMINIO_DO_SEU_SITE}?payment=success`, // Redireciona de volta para o seu site
      cancel_url: `${DOMINIO_DO_SEU_SITE}?payment=cancel`,  // Redireciona de volta para o seu site
      metadata: {
        userId: userId // Passa o Firebase UID para o metadata
      }
    });
    
    // Sucesso, envia o ID da sessão
    res.json({ id: session.id }); 

  } catch (error) {
    console.error("ERRO GRAVE ao criar sessão de checkout:", error);
    
    // ✅ CORREÇÃO PRINCIPAL:
    // Em vez de enviar 'error.message' (que pode ser um objeto),
    // enviamos um JSON simples e seguro.
    return res.status(500).json({ error: 'Falha ao criar sessão de pagamento no Stripe.' }); 
  }
});

// --- WEBHOOK DO STRIPE ---
// (O Stripe nos avisa quando o pagamento é concluído)

// O Webhook precisa do "raw body" (corpo cru), não do JSON
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Erro no webhook Stripe:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Lida com o evento
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        const userId = session.metadata.userId;

        if (!userId) {
          console.error("Webhook recebido sem userId no metadata!");
          break;
        }

        console.log(`Webhook 'checkout.session.completed' recebido para userId: ${userId}`);
        
        // Atualiza o perfil do usuário no Firestore
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
          subscriptionStatus: 'premium'
        });

        console.log(`Usuário ${userId} atualizado para 'premium' no Firestore.`);
        break;
      
      // Adicione outros eventos se precisar (ex: 'customer.subscription.deleted')

      default:
        // Evento inesperado
    }
  } catch (error) {
    console.error("Erro ao processar evento do webhook:", error);
    // Não envie um erro 500 para o Stripe, senão ele continuará tentando.
    // Apenas logamos o erro.
  }

  // ✅ CORREÇÃO BÔNUS:
  // Envia uma resposta JSON válida. O Vercel não gosta de '.send()' vazio.
  res.status(200).json({ received: true });
});

// Inicia o servidor (APENAS PARA TESTE LOCAL)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando localmente na porta ${PORT}`);
  });
}

// Exporta o app para o Vercel
module.exports = app;