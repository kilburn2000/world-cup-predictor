// sharp ships its own types, but they don't resolve under moduleResolution
// "Bundler" here, so tsc reports an implicit-any import. Declare the module so
// type-checking passes; the actual API is exercised at runtime via tsx.
declare module "sharp";
