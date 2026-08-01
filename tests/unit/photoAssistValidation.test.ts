import { describe, expect, it } from 'vitest';
import { validatePhotoAssistResult } from '../../supabase/functions/_shared/photoAssistValidation';

describe('photo assist output boundary', () => {
  it('accepts factual titles and correctable visual questions', () => {
    expect(validatePhotoAssistResult({
      titleSuggestion: '图书馆窗边的桌子',
      optionalQuestions: ['画面中似乎是一个学习空间，这次是在学习、等待，还是做其他事情？'],
    })).toEqual({
      titleSuggestion: '图书馆窗边的桌子',
      optionalQuestions: ['画面中似乎是一个学习空间，这次是在学习、等待，还是做其他事情？'],
    });
  });

  it('rejects emotional titles and unqualified visual assertions', () => {
    expect(validatePhotoAssistResult({
      titleSuggestion: '焦虑的学习时刻',
      optionalQuestions: [],
    })).toBeNull();
    expect(validatePhotoAssistResult({
      titleSuggestion: '教学楼入口',
      optionalQuestions: ['照片里是教学楼，你为什么来这里？'],
    })).toBeNull();
  });

  it('rejects extra public fields and more than two questions', () => {
    expect(validatePhotoAssistResult({
      titleSuggestion: null,
      optionalQuestions: [],
      emotion: 'calm',
    })).toBeNull();
    expect(validatePhotoAssistResult({
      titleSuggestion: null,
      optionalQuestions: ['一？', '二？', '三？'],
    })).toBeNull();
  });
});
