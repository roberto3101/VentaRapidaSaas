import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICO_KEY = 'esPublico';
export const Publico = () => SetMetadata(ES_PUBLICO_KEY, true);
