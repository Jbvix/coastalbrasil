/*
 * Coastal Navigator Brasil — gerador do relatório de derrota
 * Autor: Jossian Brito (Charlie Bravo)
 *
 * Produz um documento HTML autocontido com os dados da viagem, a tabela de
 * waypoints com ETA e consumo, os faróis avistáveis no trajeto e o resumo de
 * combustível. O arquivo é baixado e pode ser impresso ou salvo em PDF.
 *
 * Extraído do app.html na v2.2.0: eram 542 linhas — um SEGUNDO documento HTML
 * completo dentro de um template literal no meio do arquivo principal.
 *
 * DADOS DO USUÁRIO SÃO ESCAPADOS. O relatório é exportado e compartilhado;
 * nome de embarcação, origem e destino passam por escapeHtml() (nautical.js).
 *
 * Depende de: waypoints, tripData (app.html) · escapeHtml, effectiveRange,
 * calculateVisibility, safeFileName (nautical.js).
 */

function generateReport() {
  if (waypoints.length < 2) {
    alert('⚠️ Adicione pelo menos 2 waypoints para gerar relatório!');
    return;
  }

  const lastWp = waypoints[waypoints.length - 1];
  const totalTime = (lastWp.eta - tripData.departureDate) / (1000 * 60 * 60);
  const fuelPercentage = (lastWp.fuelRemaining / tripData.fuelInitial) * 100;

  let report = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Viagem - ${escapeHtml(tripData.vesselName)}</title>
  <style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #f5f5f5;
  padding: 20px;
  color: #333;
}

.container {
  max-width: 1000px;
  margin: 0 auto;
  background: white;
  padding: 40px;
  box-shadow: 0 0 20px rgba(0,0,0,0.1);
}

.header {
  text-align: center;
  border-bottom: 3px solid #1976D2;
  padding-bottom: 20px;
  margin-bottom: 30px;
}

.header h1 {
  color: #1976D2;
  font-size: 2rem;
  margin-bottom: 10px;
}

.header .subtitle {
  color: #666;
  font-size: 1.1rem;
}

.section {
  margin-bottom: 30px;
}

.section-title {
  background: #1976D2;
  color: white;
  padding: 10px 15px;
  font-size: 1.2rem;
  margin-bottom: 15px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-bottom: 20px;
}

.info-item {
  border-left: 3px solid #FFA726;
  padding-left: 12px;
}

.info-label {
  font-weight: 600;
  color: #666;
  font-size: 0.9rem;
}

.info-value {
  font-size: 1.1rem;
  color: #1976D2;
  font-weight: 700;
  margin-top: 4px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
}

th {
  background: #1976D2;
  color: white;
  padding: 12px;
  text-align: left;
  font-weight: 600;
}

td {
  padding: 10px 12px;
  border-bottom: 1px solid #e0e0e0;
}

tr:hover {
  background: #f5f5f5;
}

.status-ok {
  color: #4CAF50;
  font-weight: 700;
}

.status-warning {
  color: #FFA726;
  font-weight: 700;
}

.status-critical {
  color: #D32F2F;
  font-weight: 700;
}

.summary-box {
  background: linear-gradient(135deg, #1976D2, #0D47A1);
  color: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.summary-box h3 {
  margin-bottom: 15px;
  font-size: 1.3rem;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.2);
}

.summary-item:last-child {
  border-bottom: none;
}

.footer {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 2px solid #e0e0e0;
  text-align: center;
  color: #666;
  font-size: 0.9rem;
}

@media print {
  body {
    background: white;
    padding: 0;
  }
  
  .container {
    box-shadow: none;
    padding: 20px;
  }
}
  </style>
</head>
<body>
  <div class="container">
<div class="header">
  <h1>⚓ RELATÓRIO DE PLANEJAMENTO DE VIAGEM</h1>
  <div class="subtitle">Coastal Navigator Brasil v2.0</div>
  <div class="subtitle">Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
</div>

<div class="section">
  <div class="section-title">🚢 DADOS DA EMBARCAÇÃO E VIAGEM</div>
  <div class="info-grid">
    <div class="info-item">
      <div class="info-label">Nome da Embarcação</div>
      <div class="info-value">${escapeHtml(tripData.vesselName)}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Velocidade Média</div>
      <div class="info-value">${tripData.speedKnots.toFixed(1)} nós</div>
    </div>
    <div class="info-item">
      <div class="info-label">Porto de Origem</div>
      <div class="info-value">${escapeHtml(tripData.origin)}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Porto de Destino</div>
      <div class="info-value">${escapeHtml(tripData.destination)}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Data/Hora de Saída</div>
      <div class="info-value">${tripData.departureDate.toLocaleString('pt-BR')}</div>
    </div>
    <div class="info-item">
      <div class="info-label">ETA de Chegada</div>
      <div class="info-value">${lastWp.eta.toLocaleString('pt-BR')}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="summary-box">
    <h3>📊 RESUMO EXECUTIVO</h3>
    <div class="summary-item">
      <span>Distância Total:</span>
      <strong>${lastWp.totalDistance.toFixed(2)} NM</strong>
    </div>
    <div class="summary-item">
      <span>Tempo Total de Viagem:</span>
      <strong>${totalTime.toFixed(1)} horas (${(totalTime / 24).toFixed(1)} dias)</strong>
    </div>
    <div class="summary-item">
      <span>Número de Waypoints:</span>
      <strong>${waypoints.length}</strong>
    </div>
    <div class="summary-item">
      <span>Consumo Total de Combustível:</span>
      <strong>${lastWp.fuelUsed.toFixed(0)} L</strong>
    </div>
    <div class="summary-item">
      <span>Saldo Inicial de Combustível:</span>
      <strong>${tripData.fuelInitial.toFixed(0)} L</strong>
    </div>
    <div class="summary-item">
      <span>Saldo Final de Combustível:</span>
      <strong>${lastWp.fuelRemaining.toFixed(0)} L (${fuelPercentage.toFixed(1)}%)</strong>
    </div>
    <div class="summary-item">
      <span>Consumo Médio por Dia:</span>
      <strong>${((lastWp.fuelUsed / (totalTime / 24))).toFixed(0)} L/dia</strong>
    </div>
    <div class="summary-item">
      <span>Taxa de Consumo:</span>
      <strong>${tripData.fuelConsumption.toFixed(1)} L/h</strong>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">📍 LISTA DETALHADA DE WAYPOINTS</div>
  <table>
    <thead>
      <tr>
        <th>WP</th>
        <th>Posição</th>
        <th>Data/Hora</th>
        <th>Distância (NM)</th>
        <th>Farol Visível</th>
        <th>Combustível Acum. (L)</th>
        <th>Saldo (L)</th>
      </tr>
    </thead>
    <tbody>`;

  waypoints.forEach((wp, i) => {
    report += `
      <tr>
        <td><strong>${wp.name}</strong></td>
        <td>${wp.lat.toFixed(6)}°, ${wp.lng.toFixed(6)}°</td>
        <td>${wp.eta.toLocaleString('pt-BR')}</td>
        <td>${wp.distance.toFixed(2)} NM${i > 0 ? ` (Total: ${wp.totalDistance.toFixed(2)})` : ''}</td>
        <td class="${wp.lighthouseVisible ? 'status-ok' : 'status-warning'}">
          ${wp.lighthouseVisible ? '✓ ' + escapeHtml(wp.nearestLighthouse.name) : '⚠ Fora de alcance'}
        </td>
        <td>${wp.fuelUsed.toFixed(0)} L</td>
        <td class="${wp.fuelRemaining / tripData.fuelInitial < 0.2 ? 'status-critical' : wp.fuelRemaining / tripData.fuelInitial < 0.4 ? 'status-warning' : 'status-ok'}">
          ${wp.fuelRemaining.toFixed(0)} L (${((wp.fuelRemaining / tripData.fuelInitial) * 100).toFixed(1)}%)
        </td>
      </tr>`;
  });

  report += `
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">⛽ CONSUMO POR PERÍODO DE 12 HORAS</div>
  <table>
    <thead>
      <tr>
        <th>Período</th>
        <th>Data/Hora</th>
        <th>Consumo (L)</th>
        <th>Acumulado (L)</th>
      </tr>
    </thead>
    <tbody>`;

  // Calcular consumo a cada 12 horas com data/hora real
  let time12h = 0;
  let prevFuel = 0;
  let periodNum = 1;

  while (time12h < totalTime) {
    const nextTime = Math.min(time12h + 12, totalTime);
    const periodDuration = nextTime - time12h;
    const fuelAtEnd = nextTime * tripData.fuelConsumption;
    const periodFuel = fuelAtEnd - prevFuel;

    // NOVO v2.0.5: Calcular data/hora real do período
    const startDate = new Date(tripData.departureDate.getTime() + (time12h * 60 * 60 * 1000));
    const endDate = new Date(tripData.departureDate.getTime() + (nextTime * 60 * 60 * 1000));

    // Formatar data/hora (formato compacto: dd/MM HH:mm)
    const formatDateTime = (date) => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');
      const minute = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month} ${hour}:${minute}`;
    };

    report += `
      <tr>
        <td><strong>Período ${periodNum}</strong></td>
        <td>${formatDateTime(startDate)} - ${formatDateTime(endDate)} (${periodDuration.toFixed(1)}h)</td>
        <td>${periodFuel.toFixed(0)} L</td>
        <td>${fuelAtEnd.toFixed(0)} L</td>
      </tr>`;

    time12h = nextTime;
    prevFuel = fuelAtEnd;
    periodNum++;
  }

  report += `
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">💡 FARÓIS DE REFERÊNCIA NA ROTA</div>
  <table>
    <thead>
      <tr>
        <th>Farol</th>
        <th>Waypoint Próximo</th>
        <th>Posição</th>
        <th>Alcance</th>
        <th>Característica</th>
      </tr>
    </thead>
    <tbody>`;

  // Listar faróis únicos referenciados
  const uniqueLighthouses = new Map();
  waypoints.forEach(wp => {
    if (wp.nearestLighthouse && !uniqueLighthouses.has(wp.nearestLighthouse.name)) {
      uniqueLighthouses.set(wp.nearestLighthouse.name, {
        lighthouse: wp.nearestLighthouse,
        waypoint: wp.name
      });
    }
  });

  uniqueLighthouses.forEach(item => {
    const lh = item.lighthouse;
    report += `
      <tr>
        <td><strong>${escapeHtml(lh.name)}</strong></td>
        <td>${escapeHtml(item.waypoint)}</td>
        <td>${lh.lat.toFixed(4)}°, ${lh.lng.toFixed(4)}°</td>
        <td>${effectiveRange(lh).toFixed(1)} NM (lum ${lh.rangeLum} · geo ${calculateVisibility(lh.altitude).toFixed(1)})</td>
        <td>${escapeHtml(lh.character)}</td>
      </tr>`;
  });

  report += `
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">⚠️ OBSERVAÇÕES E RECOMENDAÇÕES</div>
  <div style="padding: 15px; background: #f5f5f5; border-left: 4px solid #FFA726;">`;

  if (fuelPercentage < 20) {
    report += `
    <p style="color: #D32F2F; font-weight: 700; margin-bottom: 10px;">
      ⚠️ ATENÇÃO: Margem de combustível crítica (${fuelPercentage.toFixed(1)}%)
    </p>
    <p style="margin-bottom: 10px;">
      Recomenda-se reabastecimento antes da partida ou revisão da rota.
    </p>`;
  } else if (fuelPercentage < 40) {
    report += `
    <p style="color: #FFA726; font-weight: 700; margin-bottom: 10px;">
      ⚠️ Atenção: Margem de combustível moderada (${fuelPercentage.toFixed(1)}%)
    </p>
    <p style="margin-bottom: 10px;">
      Considere possíveis desvios de rota ou condições adversas.
    </p>`;
  } else {
    report += `
    <p style="color: #4CAF50; font-weight: 700; margin-bottom: 10px;">
      ✓ Margem de combustível adequada (${fuelPercentage.toFixed(1)}%)
    </p>`;
  }

  report += `
    <p style="margin-bottom: 10px;">
      • Verificar condições meteorológicas antes da partida<br>
      • Confirmar NOTMARs e Avisos aos Navegantes<br>
      • Validar posições com cartas náuticas oficiais da DHN<br>
      • Manter escuta no VHF canal 16 (emergências)<br>
      • Ajustar velocidade conforme condições de mar e vento
    </p>
    <p style="font-size: 0.9rem; color: #666; margin-top: 15px;">
      <strong>AVISO LEGAL:</strong> Este relatório é uma ferramenta de planejamento. 
      Não substitui as cartas náuticas oficiais, publicações e julgamento profissional do Comandante.
      Sempre consulte as publicações atualizadas da DHN antes de executar qualquer navegação.
    </p>
  </div>
</div>

<div class="footer">
  <p><strong>Gerado por Coastal Navigator Brasil v2.0</strong></p>
  <p>Sistema de Planejamento de Viagem Marítima</p>
  <p>Desenvolvido por Jossian Brito (Charlie Bravo)</p>
  <p style="margin-top: 10px;">© 2024 - Todos os direitos reservados</p>
</div>
  </div>
</body>
</html>`;

  // Criar e baixar arquivo
  const blob = new Blob([report], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-viagem-${safeFileName(tripData.vesselName, 'embarcacao')}-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert('✅ Relatório HTML gerado com sucesso!\n\nO arquivo foi baixado e pode ser aberto em qualquer navegador ou impresso.');
}
