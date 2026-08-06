import React, { useState } from 'react';

import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/dialog/dialog';
import { Input } from '@/components/input/input';
import type { UserRole } from '@/context/auth-context/auth-context';
import { apiFetch } from '@/lib/api';

import type { AdminUser } from './admin-types';
import { TemporaryPasswordField } from './temporary-password-field';

export const UserCreateDialog = ({
    onCreated,
}: {
    onCreated: (user: AdminUser) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [department, setDepartment] = useState('');
    const [temporaryPassword, setTemporaryPassword] = useState('');
    const [role, setRole] = useState<UserRole>('VIEWER');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const setDialogOpen = (nextOpen: boolean) => {
        if (!nextOpen && saving) return;
        setOpen(nextOpen);
        if (nextOpen) {
            setUsername('');
            setDisplayName('');
            setDepartment('');
            setTemporaryPassword('');
            setRole('VIEWER');
            setError('');
        }
    };

    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await apiFetch<{ user: AdminUser }>(
                '/api/admin/users',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        username,
                        displayName,
                        department,
                        temporaryPassword,
                        role,
                    }),
                }
            );
            onCreated(response.user);
            setOpen(false);
        } catch (createError) {
            setError(
                createError instanceof Error
                    ? createError.message
                    : '사용자를 생성하지 못했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>사용자 생성</Button>
            </DialogTrigger>
            <DialogContent showClose={!saving}>
                <form className="space-y-4" onSubmit={create}>
                    <DialogHeader>
                        <DialogTitle>사용자 생성</DialogTitle>
                        <DialogDescription>
                            아이디는 중복될 수 없으며 첫 로그인 때 비밀번호를
                            변경해야 합니다.
                        </DialogDescription>
                    </DialogHeader>
                    <label className="block space-y-1 text-sm">
                        <span>아이디</span>
                        <Input
                            value={username}
                            onChange={(event) =>
                                setUsername(event.target.value)
                            }
                            disabled={saving}
                            required
                        />
                    </label>
                    <label className="block space-y-1 text-sm">
                        <span>표시 이름</span>
                        <Input
                            value={displayName}
                            onChange={(event) =>
                                setDisplayName(event.target.value)
                            }
                            disabled={saving}
                            required
                        />
                    </label>
                    <label className="block space-y-1 text-sm">
                        <span>부서명</span>
                        <Input
                            maxLength={100}
                            value={department}
                            onChange={(event) =>
                                setDepartment(event.target.value)
                            }
                            disabled={saving}
                        />
                    </label>
                    <TemporaryPasswordField
                        value={temporaryPassword}
                        onChange={setTemporaryPassword}
                        disabled={saving}
                        required
                    />
                    <label className="block space-y-1 text-sm">
                        <span>역할</span>
                        <select
                            className="h-9 w-full rounded-md border bg-background px-3"
                            value={role}
                            onChange={(event) =>
                                setRole(event.target.value as UserRole)
                            }
                            disabled={saving}
                        >
                            <option value="VIEWER">VIEWER</option>
                            <option value="PUBLISHER">PUBLISHER</option>
                            <option value="ADMIN">ADMIN</option>
                        </select>
                    </label>
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={saving}
                            >
                                취소
                            </Button>
                        </DialogClose>
                        <Button type="submit" disabled={saving}>
                            {saving ? '생성 중…' : '생성'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
