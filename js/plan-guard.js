// ============================================
// AgroFinca - Plan Guard (Freemium Gating)
// Controls access to premium features
// ============================================

const PlanGuard = (() => {

  function isPaid() {
    return AuthModule.isPaid();
  }

  function canAddFarm() {
    if (isPaid()) return { allowed: true };
    const user = AuthModule.getUser();
    // Count farms is async, so we provide a sync check helper
    return { allowed: true, needsAsyncCheck: true };
  }

  // Async version - checks actual farm count
  async function canAddFarmAsync() {
    if (isPaid()) return true;
    const userId = AuthModule.getUserId();
    if (!userId) return false;
    const fincas = await AgroDB.getByIndex('fincas', 'propietario_id', userId);
    return fincas.length < AppConfig.FREE_FARM_LIMIT;
  }

  function showUpgradePrompt(featureName) {
    const bodyHTML = `
      <div style="text-align:center; padding: 1rem;">
        <div style="font-size:3rem; margin-bottom:1rem;">⭐</div>
        <h3 style="margin-bottom:0.5rem;">Funcionalidad Premium</h3>
        <p style="color:var(--text-secondary); margin-bottom:1.5rem;">
          <strong>${featureName}</strong> está disponible en el plan Premium.
          Actualiza tu cuenta para desbloquear todas las funcionalidades.
        </p>
        <div style="background:var(--surface); border-radius:12px; padding:1rem; margin-bottom:1.5rem; text-align:left;">
          <h4 style="margin-bottom:0.75rem;">Plan Premium incluye:</h4>
          <ul style="list-style:none; padding:0; margin:0;">
            <li style="padding:0.25rem 0;">🤖 Asistente IA con Gemini</li>
            <li style="padding:0.25rem 0;">📸 Análisis de fotos con IA</li>
            <li style="padding:0.25rem 0;">🎤 Entrada por voz</li>
            <li style="padding:0.25rem 0;">📊 Análisis financiero avanzado</li>
            <li style="padding:0.25rem 0;">🏡 Fincas ilimitadas</li>
            <li style="padding:0.25rem 0;">📄 Exportar reportes</li>
          </ul>
        </div>
        <button onclick="PlanGuard.openUpgrade()" class="btn btn-primary btn-block" style="margin-bottom:0.5rem;">
          Actualizar a Premium
        </button>
        <button onclick="App.closeModal()" class="btn btn-outline btn-block">
          Más tarde
        </button>
      </div>
    `;
    App.showModal('', bodyHTML);
  }

  function guardFeature(featureName, callback) {
    if (isPaid()) {
      callback();
      return;
    }
    showUpgradePrompt(featureName);
  }

  // Open PayPal upgrade flow
  function openUpgrade() {
    App.closeModal();
    // Navigate to config page which has upgrade section
    App.navigateTo('configuracion');
    // Trigger the upgrade section after a small delay
    setTimeout(() => {
      const upgradeSection = document.getElementById('upgrade-section');
      if (upgradeSection) {
        upgradeSection.scrollIntoView({ behavior: 'smooth' });
      }
    }, 300);
  }

  // Check if feature is available and show prompt if not
  function checkFeature(featureName) {
    if (isPaid()) return true;
    showUpgradePrompt(featureName);
    return false;
  }

  return {
    isPaid,
    canAddFarm,
    canAddFarmAsync,
    showUpgradePrompt,
    guardFeature,
    checkFeature,
    openUpgrade
  };
})();
