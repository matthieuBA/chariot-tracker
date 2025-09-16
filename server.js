const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Servir l'app React depuis le dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Fichiers de données
const DATA_DIR = './data';
const CHARIOTS_FILE = path.join(DATA_DIR, 'chariots.json');
const HISTORIQUE_FILE = path.join(DATA_DIR, 'historique.json');

// Créer le dossier data si il n'existe pas
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Données par défaut
const defaultChariots = [
  { id: 1, nom: 'chir A', etage: 1, etat: 'cuisine', actif: true },
  { id: 2, nom: 'Chir B1', etage: 1, etat: 'cuisine', actif: true },
  { id: 3, nom: 'Chir B2', etage: 1, etat: 'service', actif: true },
  { id: 4, nom: 'Chir C', etage: 1, etat: 'cuisine', actif: true },
  { id: 5, nom: 'Med A', etage: 1, etat: 'service', actif: true },
  { id: 6, nom: 'Med B', etage: 1, etat: 'cuisine', actif: true },
  { id: 7, nom: 'Med C', etage: 1, etat: 'cuisine', actif: true },
  { id: 8, nom: 'Med D', etage: 2, etat: 'service', actif: true },
  { id: 9, nom: 'Med E', etage: 2, etat: 'cuisine', actif: true },
  { id: 10, nom: 'Mat', etage: 2, etat: 'cuisine', actif: true },
  { id: 11, nom: 'Ped', etage: 2, etat: 'service', actif: true },
  { id: 12, nom: 'Privé', etage: 3, etat: 'cuisine', actif: true },
  { id: 13, nom: 'Demi Privé', etage: 3, etat: 'cuisine', actif: true },
  { id: 14, nom: 'Urgence', etage: 0, etat: 'service', actif: true },
  { id: 15, nom: 'Onco', etage: 0, etat: 'cuisine', actif: true },
  { id: 16, nom: 'HDJ', etage: 1, etat: 'cuisine', actif: true },
  { id: 17, nom: 'Soins', etage: 0, etat: 'cuisine', actif: true }
];

// Fonctions utilitaires
function lireChariots() {
  try {
    if (fs.existsSync(CHARIOTS_FILE)) {
      return JSON.parse(fs.readFileSync(CHARIOTS_FILE, 'utf8'));
    } else {
      fs.writeFileSync(CHARIOTS_FILE, JSON.stringify(defaultChariots, null, 2));
      return defaultChariots;
    }
  } catch (error) {
    console.log('Erreur lecture chariots:', error);
    return defaultChariots;
  }
}

function sauverChariots(chariots) {
  try {
    fs.writeFileSync(CHARIOTS_FILE, JSON.stringify(chariots, null, 2));
  } catch (error) {
    console.log('Erreur sauvegarde chariots:', error);
  }
}

function lireHistorique() {
  try {
    if (fs.existsSync(HISTORIQUE_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORIQUE_FILE, 'utf8'));
    }
    return [];
  } catch (error) {
    console.log('Erreur lecture historique:', error);
    return [];
  }
}

function sauverHistorique(historique) {
  try {
    fs.writeFileSync(HISTORIQUE_FILE, JSON.stringify(historique, null, 2));
  } catch (error) {
    console.log('Erreur sauvegarde historique:', error);
  }
}

// Routes API
app.get('/api/chariots', (req, res) => {
  const chariots = lireChariots();
  res.json(chariots);
});

app.get('/api/historique', (req, res) => {
  const historique = lireHistorique();
  res.json(historique);
});

app.post('/api/chariots/:id/etat', (req, res) => {
  const { id } = req.params;
  const { nouvelEtat, utilisateur } = req.body;
  
  const chariots = lireChariots();
  const chariot = chariots.find(c => c.id === parseInt(id));
  
  if (!chariot) {
    return res.status(404).json({ error: 'Chariot introuvable' });
  }
  
  // Mettre à jour l'état
  chariot.etat = nouvelEtat;
  sauverChariots(chariots);
  
  // Ajouter à l'historique
  const historique = lireHistorique();
  const nouvelleAction = {
    id: Date.now(),
    chariot: chariot.nom,
    action: nouvelEtat === 'service' ? `Monté vers étage ${chariot.etage}` : 'Descendu en cuisine',
    utilisateur: utilisateur,
    timestamp: new Date().toLocaleString('fr-FR')
  };
  historique.unshift(nouvelleAction);
  sauverHistorique(historique);
  
  // Diffuser à tous les clients connectés
  io.emit('chariots_updated', chariots);
  io.emit('historique_updated', historique);
  
  res.json({ success: true, chariot });
});

app.put('/api/chariots', (req, res) => {
  const { chariots, utilisateur } = req.body;
  sauverChariots(chariots);
  
  // Ajouter à l'historique si c'est une action admin
  if (utilisateur) {
    const historique = lireHistorique();
    const nouvelleAction = {
      id: Date.now(),
      chariot: 'Configuration',
      action: 'Mise à jour par administrateur',
      utilisateur: utilisateur,
      timestamp: new Date().toLocaleString('fr-FR')
    };
    historique.unshift(nouvelleAction);
    sauverHistorique(historique);
    io.emit('historique_updated', historique);
  }
  
  // Diffuser à tous les clients
  io.emit('chariots_updated', chariots);
  res.json({ success: true });
});

app.delete('/api/historique', (req, res) => {
  const { utilisateur } = req.body;
  sauverHistorique([]);
  
  console.log(`Historique vidé par ${utilisateur}`);
  io.emit('historique_updated', []);
  res.json({ success: true });
});

// Route pour servir l'app React (doit être en dernier)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket pour temps réel
io.on('connection', (socket) => {
  console.log('Client connecté');
  
  // Envoyer les données actuelles au nouveau client
  const chariots = lireChariots();
  const historique = lireHistorique();
  socket.emit('chariots_updated', chariots);
  socket.emit('historique_updated', historique);
  
  socket.on('disconnect', () => {
    console.log('Client déconnecté');
  });
});

// Keep alive pour éviter que Render mette l'app en veille
setInterval(() => {
  console.log('Keep alive - App active');
}, 14 * 60 * 1000); // Toutes les 14 minutes

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`💾 Données stockées dans: ${path.resolve(DATA_DIR)}`);
  console.log(`🌐 App accessible sur: http://localhost:${PORT}`);
});