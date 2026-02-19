import * as bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const hashearContrasena = async (contrasena: string): Promise<string> =>
  bcrypt.hash(contrasena, SALT_ROUNDS);

export const compararContrasena = async (
  contrasena: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(contrasena, hash);

export const hashearToken = async (token: string): Promise<string> =>
  bcrypt.hash(token, 10);

export const compararToken = async (
  token: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(token, hash);
