## Objetivo
Evitar valores negativos en todos los campos monetarios/cantitativos de la app (gastos, servicios, domicilio). Defensa en profundidad: blindaje en el input (UX) + saneamiento en el guardado (datos persistidos nunca negativos).

## Patrón a replicar (ya existe en el código para domicilio)
```jsx
<input className="inp" type="number" min="0" ... 
  onChange={e=>setX(Math.max(0, Number(e.target.value)||0))} />
```
Y en el guardado: `Math.max(0, toN(valor))`.

## Cambios

### 1. `src/App.jsx` — Agregar gasto (línea ~1607)
- Input `amount`: añadir `min="0"` y `onChange` con `Math.max(0, ...)` (manteniendo el estado como string o normalizado; verifico cómo lo usa `add`).
- Función `add` (línea ~1618, antes: `disabled={!desc.trim()||!amount}`): al construir el objeto del gasto, sanitizar con `Math.max(0, toN(amount))` para que el monto persistido nunca sea negativo.

### 2. `src/App.jsx` — Editar gasto (línea ~1657)
- Input `amount` en `editData`: añadir `min="0"` y `onChange` con `Math.max(0, ...)`.
- Función `save` de edición: al persistir, sanitizar `editData.amount` con `Math.max(0, toN(...))`.

### 3. `src/App.jsx` — Nuevo servicio (línea ~1492)
- Input `price`: añadir `min="0"` y `onChange` con `Math.max(0, ...)`.
- Validación `disabled={!name.trim()||!price}` → ajustar para que `price>=0` no bloquee (0 es válido si quiere servicio gratis). El guardado ya usa `toN(price)`; añadir `Math.max(0, toN(price))`.

### 4. `src/App.jsx` — Editar servicio (línea ~1504)
- Input `eP` (precio editado): añadir `min="0"` y `onChange` con `Math.max(0, ...)`.
- Función de guardado del servicio editado: sanitizar con `Math.max(0, toN(eP))`. Esto también previene que el historial de precios (`priceHistory`) se llene con precios negativos.

### 5. `src/utils/seguridad` — sin helpers compartidos nuevos
Hago el saneamiento inline (`Math.max(0, toN(x))`) en cada punto de guardado, sin añadir un helper nuevo (mínima superficie de cambio, sigue el estilo del código).

## Defensa en profundidad
Limpio el dato en **dos** niveles:
- **Input:** `type="number" min="0"` → spinners no bajan de 0, teclado lo bloquea parcialmente.
- **Guardado:** `Math.max(0, toN(valor))` → cubre pegar "-50", editar el dato crudo, o cualquier fuente que llegue con signo negativo.

## No cambio
- Domicilio (`EditAppt`/`NewAppt`): ya está blindado.
- Cálculos agregados (`gastos = me.reduce(...)`, revenue, etc.): consumen `toN(amount||0)` que seguirá funcionando; como los datos persistidos ya no serán negativos, no se altera el resultado. No los toco para no inflar el diff.
- `toN` en `helpers.js`: la dejo como está (acepta signo) porque la saneo en el punto de guardado. Cambiar `toN` a clip-negative alteraría 22 tests y rompería la separación "helpers puros". No lo hago.

## Verificación
- `npm run build` → debe seguir pasando limpio y sin warnings.
- `npm test` → los 22 tests existentes deben seguir pasando (no toco helpers).
- Reviso visualmente que los 4 inputs tengan `min="0"` y el `onChange` saneador.