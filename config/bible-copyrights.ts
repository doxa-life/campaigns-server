const BIBLE_COPYRIGHTS: Record<string, string> = {
  NKJV: 'Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.',
  NVI: 'Santa Biblia, NUEVA VERSIÓN INTERNACIONAL® NVI® © 1999, 2015, 2022 por Biblica, Inc.® Usada con permiso de Biblica, Inc.® Reservados todos los derechos en todo el mundo.',
  LSG: 'La Sainte Bible, traduction de Louis Segond, 1910.',
  NAA: 'Nova Almeida Atualizada (NAA) Copyright © 2017 Sociedade Bíblica do Brasil. Todos os direitos reservados.',
  SVD: 'الكتاب المقدس - ترجمة سميث وفاندايك',
  SYNOD: 'Библия. Синодальный перевод.',
  SCH2000: 'Copyright © 2000 Genfer Bibelgesellschaft. Wiedergegeben mit freundlicher Genehmigung. Alle Rechte vorbehalten.',
  NR06: 'La Sacra Bibbia Nuova Riveduta 2006. Copyright © 2008, Società Biblica di Ginevra. Usato con permesso. Tutti i diritti riservati.',
  CUNPS: '新标点和合本 ©1988, 1989, 1996 United Bible Societies.',
  OV: 'पवित्र बाइबिल OV (Re-edited). Copyright Bible Society of India.',
  NTR: 'Sfânta Biblie, Noua Traducere Românească™, NTR™ Copyright © 2007, 2010, 2016, 2021 by Biblica, Inc.®',
}

export function getCopyrightNotice(translationId: string): string | null {
  return BIBLE_COPYRIGHTS[translationId] ?? null
}
