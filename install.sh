#!/bin/bash

echo "╔════════════════════════════════════════╗"
echo "║  INSTALADOR - TELEENFERMERIA           ║"
echo "╚════════════════════════════════════════╝"

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "📥 Descargar desde: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js instalado: $(node -v)"
echo "✅ NPM instalado: $(npm -v)"

# Instalar dependencias
echo ""
echo "📦 Instalando dependencias..."
npm install

# Verificar instalación
if [ -d "node_modules" ]; then
    echo "✅ Dependencias instaladas correctamente"
else
    echo "❌ Error al instalar dependencias"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  ✅ INSTALACIÓN COMPLETADA             ║"
echo "║  Para iniciar: npm start               ║"
echo "║  Servidor: http://localhost:3000       ║
echo "╚════════════════════════════════════════╝"
