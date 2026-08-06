import React, { useMemo, useState } from 'react';

import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@/components/pagination/pagination';
import { ScrollArea } from '@/components/scroll-area/scroll-area';

const PAGE_SIZE = 20;

export interface AssignmentOption {
    id: string;
    primary: string;
    secondary?: string;
    badges?: string[];
    disabled?: boolean;
}

interface AssignmentPickerProps {
    options: AssignmentOption[];
    selectedIds: Set<string>;
    initialIds: Set<string>;
    searchLabel: string;
    disabled?: boolean;
    onChange: (ids: Set<string>) => void;
}

const Paging = ({
    label,
    page,
    total,
    disabled,
    onChange,
}: {
    label: string;
    page: number;
    total: number;
    disabled: boolean;
    onChange: (page: number) => void;
}) => {
    if (total <= 1) return null;
    const previousDisabled = disabled || page === 1;
    const nextDisabled = disabled || page === total;
    return (
        <Pagination aria-label={label} className="pt-3">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        href="#"
                        aria-disabled={previousDisabled}
                        className={
                            previousDisabled
                                ? 'pointer-events-none opacity-50'
                                : ''
                        }
                        onClick={(event) => {
                            event.preventDefault();
                            if (!previousDisabled) onChange(page - 1);
                        }}
                    />
                </PaginationItem>
                <PaginationItem className="px-2 text-sm text-muted-foreground">
                    {page} / {total}
                </PaginationItem>
                <PaginationItem>
                    <PaginationNext
                        href="#"
                        aria-disabled={nextDisabled}
                        className={
                            nextDisabled ? 'pointer-events-none opacity-50' : ''
                        }
                        onClick={(event) => {
                            event.preventDefault();
                            if (!nextDisabled) onChange(page + 1);
                        }}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
};

const OptionRow = ({
    option,
    action,
    disabled,
    onClick,
}: {
    option: AssignmentOption;
    action: '추가' | '제거';
    disabled: boolean;
    onClick: () => void;
}) => (
    <div className="flex items-center gap-2 p-3 text-sm">
        <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{option.primary}</p>
            {option.secondary ? (
                <p className="truncate text-muted-foreground">
                    {option.secondary}
                </p>
            ) : null}
        </div>
        {option.badges?.map((badge) => (
            <Badge key={badge} variant="secondary">
                {badge}
            </Badge>
        ))}
        <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label={`${option.primary}${option.secondary ? ` ${option.secondary}` : ''} ${action}`}
            disabled={disabled}
            onClick={onClick}
        >
            {action}
        </Button>
    </div>
);

export const AssignmentPicker = ({
    options,
    selectedIds,
    initialIds,
    searchLabel,
    disabled = false,
    onChange,
}: AssignmentPickerProps) => {
    const [search, setSearch] = useState('');
    const [selectedPage, setSelectedPage] = useState(1);
    const [availablePage, setAvailablePage] = useState(1);
    const knownIds = useMemo(
        () => new Set(options.map((option) => option.id)),
        [options]
    );
    const allOptions = useMemo(
        () => [
            ...options,
            ...[...selectedIds]
                .filter((id) => !knownIds.has(id))
                .map((id) => ({
                    id,
                    primary: '알 수 없는 대상',
                    secondary: `#${id.slice(0, 8)}`,
                })),
        ],
        [knownIds, options, selectedIds]
    );
    const query = search.trim().toLocaleLowerCase();
    const matches = (option: AssignmentOption) =>
        [option.primary, option.secondary, option.id, ...(option.badges ?? [])]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase()
            .includes(query);
    const selected = allOptions.filter(
        (option) => selectedIds.has(option.id) && matches(option)
    );
    const available = options.filter(
        (option) => !selectedIds.has(option.id) && matches(option)
    );
    const selectedPages = Math.max(1, Math.ceil(selected.length / PAGE_SIZE));
    const availablePages = Math.max(1, Math.ceil(available.length / PAGE_SIZE));
    const safeSelectedPage = Math.min(selectedPage, selectedPages);
    const safeAvailablePage = Math.min(availablePage, availablePages);
    const additions = [...selectedIds].filter(
        (id) => !initialIds.has(id)
    ).length;
    const removals = [...initialIds].filter(
        (id) => !selectedIds.has(id)
    ).length;

    const change = (id: string, selected: boolean) => {
        const next = new Set(selectedIds);
        if (selected) next.add(id);
        else next.delete(id);
        onChange(next);
    };

    return (
        <div className="space-y-4">
            <Input
                type="search"
                aria-label={searchLabel}
                placeholder="이름 또는 아이디 검색"
                value={search}
                disabled={disabled}
                onChange={(event) => {
                    setSearch(event.target.value);
                    setSelectedPage(1);
                    setAvailablePage(1);
                }}
            />
            <p aria-live="polite" className="text-sm text-muted-foreground">
                선택 {selectedIds.size}개 · 추가 +{additions} · 제거 -{removals}
            </p>

            <section aria-labelledby="assignment-selected-heading">
                <h3 id="assignment-selected-heading" className="font-medium">
                    현재 선택 {selected.length}개
                </h3>
                <ScrollArea className="mt-2 h-36 rounded-md border">
                    <div className="divide-y">
                        {selected
                            .slice(
                                (safeSelectedPage - 1) * PAGE_SIZE,
                                safeSelectedPage * PAGE_SIZE
                            )
                            .map((option) => (
                                <OptionRow
                                    key={option.id}
                                    option={option}
                                    action="제거"
                                    disabled={disabled}
                                    onClick={() => change(option.id, false)}
                                />
                            ))}
                        {selected.length === 0 ? (
                            <p className="p-6 text-center text-sm text-muted-foreground">
                                선택된 대상이 없습니다.
                            </p>
                        ) : null}
                    </div>
                </ScrollArea>
                <Paging
                    label="현재 선택 페이지"
                    page={safeSelectedPage}
                    total={selectedPages}
                    disabled={disabled}
                    onChange={setSelectedPage}
                />
            </section>

            <section aria-labelledby="assignment-available-heading">
                <h3 id="assignment-available-heading" className="font-medium">
                    추가 가능 {available.length}개
                </h3>
                <ScrollArea className="mt-2 h-52 rounded-md border">
                    <div className="divide-y">
                        {available
                            .slice(
                                (safeAvailablePage - 1) * PAGE_SIZE,
                                safeAvailablePage * PAGE_SIZE
                            )
                            .map((option) => (
                                <OptionRow
                                    key={option.id}
                                    option={option}
                                    action="추가"
                                    disabled={
                                        disabled || Boolean(option.disabled)
                                    }
                                    onClick={() => change(option.id, true)}
                                />
                            ))}
                        {available.length === 0 ? (
                            <p className="p-6 text-center text-sm text-muted-foreground">
                                추가할 대상이 없습니다.
                            </p>
                        ) : null}
                    </div>
                </ScrollArea>
                <Paging
                    label="추가 후보 페이지"
                    page={safeAvailablePage}
                    total={availablePages}
                    disabled={disabled}
                    onChange={setAvailablePage}
                />
            </section>
        </div>
    );
};
