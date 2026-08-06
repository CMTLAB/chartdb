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
} from '@/components/dialog/dialog';
import { Input } from '@/components/input/input';
import type { UserRole } from '@/context/auth-context/auth-context';
import { apiFetch } from '@/lib/api';

import type { AdminUser } from './admin-types';
import { TemporaryPasswordField } from './temporary-password-field';

export const UserEditDialog = ({
    user,
    onUpdated,
    onClose,
}: {
    user: AdminUser;
    onUpdated: (user: AdminUser) => void;
    onClose: () => void;
}) => {
    const [displayName, setDisplayName] = useState(user.displayName);
    const [department, setDepartment] = useState(user.department ?? '');
    const [role, setRole] = useState<UserRole>(user.role);
    const [active, setActive] = useState(user.active);
    const [temporaryPassword, setTemporaryPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const update = {
                displayName,
                department,
                role,
                active,
                ...(temporaryPassword ? { temporaryPassword } : {}),
            };
            const response = await apiFetch<{ user: AdminUser }>(
                `/api/admin/users/${user.id}`,
                { method: 'PATCH', body: JSON.stringify(update) }
            );
            onUpdated(response.user);
        } catch (saveError) {
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : '사용자를 변경하지 못했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open
            onOpenChange={(nextOpen) => {
                if (!nextOpen && !saving) onClose();
            }}
        >
            <DialogContent showClose={!saving}>
                <form className="space-y-4" onSubmit={save}>
                    <DialogHeader>
                        <DialogTitle>사용자 수정</DialogTitle>
                        <DialogDescription>
                            저장할 때 사용자 정보가 반영됩니다. 임시 비밀번호를
                            생성해 저장하면 기존 세션이 종료되고 다음 로그인에서
                            변경을 요구합니다.
                        </DialogDescription>
                    </DialogHeader>
                    <label className="block space-y-1 text-sm">
                        <span>아이디</span>
                        <Input value={user.username} readOnly disabled />
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
                    <label className="block space-y-1 text-sm">
                        <span>계정 상태</span>
                        <select
                            className="h-9 w-full rounded-md border bg-background px-3"
                            value={active ? 'active' : 'inactive'}
                            onChange={(event) =>
                                setActive(event.target.value === 'active')
                            }
                            disabled={saving}
                        >
                            <option value="active">활성</option>
                            <option value="inactive">비활성</option>
                        </select>
                    </label>
                    <TemporaryPasswordField
                        value={temporaryPassword}
                        onChange={setTemporaryPassword}
                        disabled={saving}
                        generatedOnly
                    />
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
                            {saving ? '저장 중…' : '저장'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
