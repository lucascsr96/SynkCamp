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

// --- Configuração do CORS ---
// ✅ CORRIGIDO: Lista de permissões mais robusta
const allowedOrigins = [
  DOMINIO_DO_SEU_SITE, // A URL do seu GitHub (https://lucascsr96.github.io)
  'https://lucascsr96.github.io', // Garantia explícita
  'https://synk-camp.vercel.app' // O antigo, caso use
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite a origem se ela estiver na lista 'allowedOrigins'
    // ou se a origem for 'undefined' (ex: testes de servidor local)
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('CORS: Acesso negado para esta origem.'));
    }
  }
}));

// Responde a solicitações 'OPTIONS' (checa-mate do CORS)
app.options('*', cors()); 
// --- Fim do CORS ---


// Body parser para o checkout
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, userId } = req.body;

    // Validação
    if (!priceId || !userId) {
      console.warn("Chamada recebida sem priceId ou userId.");
      return res.status(400).json({ error: 'Price ID e User ID são obrigatórios.' });
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
      // Usa a variável de ambiente para os redirecionamentos
      success_url: `${DOMINIO_DO_SEU_SITE}?payment=success`, 
      cancel_url: `${DOMINIO_DO_SEU_SITE}?payment=cancel`,  
      metadata: {
        userId: userId // Passa o Firebase UID para o metadata
      }
    });
    
    // Sucesso, envia o ID da sessão
    res.json({ id: session.id }); 

  } catch (error) {
    console.error("ERRO GRAVE ao criar sessão de checkout:", error);
    return res.status(500).json({ error: 'Falha ao criar sessão de pagamento no Stripe.' }); 
  }
});

// --- WEBHOOK DO STRIPE ---
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
      
      default:
        // Evento inesperado
    }
  } catch (error) {
    console.error("Erro ao processar evento do webhook:", error);
  }

  // Envia uma resposta JSON válida
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