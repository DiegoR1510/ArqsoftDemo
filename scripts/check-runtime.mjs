const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 20 || minor < 20) {
  console.error(`KIPU requiere Node 20.20.x (actual: ${process.version}). Usa la versión de .nvmrc.`);
  process.exit(1);
}
