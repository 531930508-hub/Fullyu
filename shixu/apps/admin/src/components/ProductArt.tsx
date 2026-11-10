import React from 'react';
import { SERIES } from '../lib/format';
import type { Series } from '../lib/types';

const MOTIF: Record<string, string> = {
  xing: 'M20 49a18 18 0 0 1 36 0M12 50h53M38 13v9M13 27l7 7M63 27l-7 7M24 60h28',
  song: 'M8 30c12-18 18 18 30 0s18 18 30 0M8 44c12-18 18 18 30 0s18 18 30 0M8 58c12-18 18 18 30 0s18 18 30 0',
  qing: 'm16 20 20 7-7 23c-3 8-20 3-18-5l5-25Zm34 0-18 9 10 21c4 7 18 0 15-7l-7-23ZM20 54l-3 11m-8-3 17 5M47 54l5 11m-6 4 15-8',
  mian: 'M53 15C32 17 33 46 55 46A25 25 0 1 1 53 15ZM58 6v8m-4-4h8'
};

export function SeriesMotif({ series }: { series: string }) {
  const shape = MOTIF[series] || MOTIF.xing;
  return (
    <svg className="motif" viewBox="0 0 76 76" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d={shape} />
    </svg>
  );
}

export type ArtProduct = {
  id: string;
  name: string;
  nameEn?: string;
  series?: Series;
  kind?: string;
  categoryId?: string;
  imageData?: string | null;
};

const LIQUID: Record<string, string> = {
  xing: '#b88355',
  song: '#c29849',
  qing: '#9b985c',
  mian: '#96714b',
  retail: '#c6b789'
};

export function ProductArt({
  product,
  className = 'product-thumb',
  label
}: {
  product: ArtProduct;
  className?: string;
  label?: string;
}) {
  const series = product.series || 'retail';
  const meta = SERIES[series] || SERIES.retail;
  const name = label || product.name;

  if (product.imageData) {
    return (
      <div className={className}>
        <img src={product.imageData} alt={name} />
      </div>
    );
  }

  if (product.kind === 'bottle') {
    return (
      <div className={className}>
        <img src="/img/celebration.webp" alt={name} />
      </div>
    );
  }

  if (product.kind === 'retail') {
    const tone = product.categoryId === 'boxes' ? 'rose' : product.categoryId === 'bags' ? 'apricot' : 'sage';
    return (
      <div className={`${className} ${tone}`}>
        <svg viewBox="0 0 130 140" role="img" aria-label={name}>
          <path d="M25 31 39 20h61l8 11v84H25Z" fill="#fffefa" stroke="#a99a85" />
          <path d="M25 31h83M91 31v84" stroke="#a99a85" />
          <rect x="37" y="44" width="42" height="56" rx="3" fill={tone === 'rose' ? '#edd9cf' : tone === 'apricot' ? '#f1deca' : '#dde5d9'} />
          <text x="58" y="68" textAnchor="middle" fill="#352f2b" fontSize="18" fontFamily="serif">
            {meta.name}
          </text>
          <text x="58" y="84" textAnchor="middle" fill="#352f2b" fontSize="5">
            TEA HOUR
          </text>
          <path d="M44 108h29" stroke="#a99a85" />
        </svg>
      </div>
    );
  }

  const liquid = LIQUID[series] || LIQUID.retail;
  return (
    <div className={`${className} ${meta.color || 'apricot'}`}>
      <svg viewBox="0 0 130 140" role="img" aria-label={name}>
        <ellipse cx="65" cy="119" rx="28" ry="5" fill="#352f2b" opacity=".08" />
        <path d="M34 22h62l-6 90q-25 12-50 0Z" fill="#fffefa" opacity=".8" stroke="#b4ac9c" />
        <path d="M38 48h54l-4 61q-23 9-46 0Z" fill={liquid} opacity=".83" />
        <ellipse cx="65" cy="48" rx="27" ry="6" fill={liquid} />
        <ellipse cx="65" cy="22" rx="31" ry="7" fill="#fffcf4" stroke="#b4ac9c" />
        <path d="M39 56h52l-2 31H41Z" fill="#f7f1e4" />
        <text x="65" y="75" textAnchor="middle" fill="#694b3d" fontSize="17" fontFamily="serif">
          {meta.name}
        </text>
        <text x="65" y="83" textAnchor="middle" fill="#706b65" fontSize="4" letterSpacing="1">
          TEA HOUR
        </text>
        <path d="M44 31 48 105" stroke="#fff" strokeWidth="3" opacity=".6" />
      </svg>
    </div>
  );
}
