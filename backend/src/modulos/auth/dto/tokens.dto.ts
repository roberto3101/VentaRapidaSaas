export class TokensDto {
  tokenAcceso: string;
  tokenRefresh: string;
  tipoToken: string = 'Bearer';
  expiraEn: number; // segundos
}

export class RefreshDto {
  tokenRefresh: string;
}
