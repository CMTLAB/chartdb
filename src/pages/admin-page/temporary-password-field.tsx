import React, { useId, useState } from 'react';

import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';

const PASSWORD_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const generateTemporaryPassword = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(20)), (value) =>
        PASSWORD_ALPHABET.charAt(value & 63)
    ).join('');

export const TemporaryPasswordField = ({
    value,
    onChange,
    required = false,
    disabled = false,
}: {
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    disabled?: boolean;
}) => {
    const id = useId();
    const [visible, setVisible] = useState(false);

    return (
        <div className="space-y-2 text-sm">
            <label htmlFor={id}>임시 비밀번호</label>
            <div className="flex gap-2">
                <Input
                    id={id}
                    type={visible ? 'text' : 'password'}
                    minLength={12}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    required={required}
                    disabled={disabled}
                />
                <Button
                    type="button"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => setVisible((current) => !current)}
                >
                    {visible ? '숨김' : '표시'}
                </Button>
            </div>
            <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                    onChange(generateTemporaryPassword());
                    setVisible(true);
                }}
            >
                임시 비밀번호 생성
            </Button>
        </div>
    );
};
