/*
 * Web Worker da IA do xadrez. Mantem a interface responsiva durante a busca.
 *
 * Os scripts herdam a query string (?v=...) do proprio worker, entao a versao
 * de cache da pagina vale tambem para engine.js e ai.js.
 */
"use strict";

importScripts("engine.js" + self.location.search, "ai.js" + self.location.search);

self.onmessage = (event) => {
  const data = event.data || {};

  try {
    const game = self.ChessEngine.createGame(String(data.fen));
    const move = self.ChessAI.chooseMove(game, String(data.level));
    self.postMessage({ id: data.id, move });
  } catch (error) {
    // Mensagem generica: a interface recalcula na thread principal.
    self.postMessage({ id: data.id, error: "falha na busca" });
  }
};

