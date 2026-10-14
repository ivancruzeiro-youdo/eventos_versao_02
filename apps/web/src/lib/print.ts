// Imprimir / salvar PDF. App instalado no iPhone (PWA em modo standalone) não tem impressão —
// window.print() simplesmente não faz nada ali —, então em vez de um botão morto, copia o link e
// explica o caminho pelo Safari. Android e desktop (inclusive instalados) imprimem normalmente.
export async function printPage(): Promise<void> {
  const iosStandalone = (navigator as any).standalone === true;
  if (!iosStandalone) {
    window.print();
    return;
  }
  try {
    await navigator.clipboard.writeText(window.location.href);
  } catch {
    // sem permissão de área de transferência — a mensagem abaixo ainda orienta
  }
  alert(
    'No iPhone o app instalado não imprime. O link desta página foi copiado: abra o Safari, cole o endereço '
    + '(pode pedir login de novo) e use Compartilhar → Imprimir, ou Salvar em PDF.',
  );
}
