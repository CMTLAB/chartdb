import {
    createHash,
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export const hashPassword = async (password) => {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, KEY_LENGTH, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: 64 * 1024 * 1024,
    });
    return [
        'scrypt',
        `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
        salt.toString('base64url'),
        key.toString('base64url'),
    ].join('$');
};

export const verifyPassword = async (password, encoded) => {
    const [algorithm, parameters, saltText, keyText, extra] =
        String(encoded).split('$');
    if (
        algorithm !== 'scrypt' ||
        parameters !== `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}` ||
        !saltText ||
        !keyText ||
        extra !== undefined
    ) {
        return false;
    }

    try {
        const expected = Buffer.from(keyText, 'base64url');
        const actual = await scrypt(
            password,
            Buffer.from(saltText, 'base64url'),
            expected.length,
            {
                N: SCRYPT_N,
                r: SCRYPT_R,
                p: SCRYPT_P,
                maxmem: 64 * 1024 * 1024,
            }
        );
        return (
            actual.length === expected.length &&
            timingSafeEqual(actual, expected)
        );
    } catch {
        return false;
    }
};

export const newSecret = () => randomBytes(32).toString('base64url');

export const hashSecret = (secret) =>
    createHash('sha256').update(secret).digest('hex');
