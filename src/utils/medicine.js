export function getMedicineStatus(medicine) {
  if (!medicine.isActive) return 'INACTIVE';
  if (new Date(medicine.expiryDate) < new Date()) return 'EXPIRED';
  if (medicine.quantity === 0) return 'OUT_OF_STOCK';
  if (medicine.quantity <= medicine.reorderLevel) return 'LOW_STOCK';
  return 'AVAILABLE';
}

export function medicineWithStatus(medicine) {
  const value = medicine.toObject ? medicine.toObject() : { ...medicine };
  return { ...value, availabilityStatus: getMedicineStatus(value) };
}
