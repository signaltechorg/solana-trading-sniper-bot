export const retrieveEnvVariable = (variableName: string): string => {
  const variable = process.env[variableName] || "";
  if (!variable) {
    console.log(`${variableName} is not set`);
    process.exit(1);
  }
  return variable;
};
