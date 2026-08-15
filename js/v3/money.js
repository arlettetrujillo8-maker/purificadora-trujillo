export function toCents(value) {
  const amount = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(amount)) throw new TypeError('Monto inválido');
  return Math.round((amount + Number.EPSILON) * 100);
}

export function fromCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('Los centavos deben ser un entero seguro');
  return cents / 100;
}

export function formatMoney(cents) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(fromCents(cents));
}

