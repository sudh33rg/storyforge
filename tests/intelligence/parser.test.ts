/**
 * Parser Tests
 *
 * Tests multi-language parsing adapters and symbol extraction.
 */

import { describe, it, expect } from 'vitest';
import { parseFile } from '../../src/intelligence/parser/treeSitterParser';
import { detectLanguage, getLanguageAdapter } from '../../src/intelligence/parser/languageAdapters';

describe('Language Detection', () => {
  it('should detect TypeScript', () => {
    expect(detectLanguage('src/app.ts')).toBe('typescript');
    expect(detectLanguage('src/App.tsx')).toBe('typescript');
  });

  it('should detect JavaScript', () => {
    expect(detectLanguage('src/app.js')).toBe('javascript');
    expect(detectLanguage('src/app.mjs')).toBe('javascript');
  });

  it('should detect Java', () => {
    expect(detectLanguage('src/Main.java')).toBe('java');
  });

  it('should detect C#', () => {
    expect(detectLanguage('src/Program.cs')).toBe('csharp');
  });

  it('should detect Python', () => {
    expect(detectLanguage('src/app.py')).toBe('python');
  });

  it('should detect Go', () => {
    expect(detectLanguage('src/main.go')).toBe('go');
  });

  it('should return undefined for unsupported languages', () => {
    expect(detectLanguage('README.md')).toBeUndefined();
    expect(detectLanguage('Makefile')).toBeUndefined();
  });
});

describe('TypeScript Parser', () => {
  it('should extract classes', () => {
    const result = parseFile(`
export class UserController {
  constructor() {}
}

export abstract class BaseService {
}
`, 'src/controller.ts', 'typescript');

    const classes = result.symbols.filter((s) => s.kind === 'class');
    expect(classes.length).toBe(2);
    expect(classes[0].name).toBe('UserController');
    expect(classes[1].name).toBe('BaseService');
  });

  it('should extract interfaces', () => {
    const result = parseFile(`
export interface UserRepository {
  findById(id: string): User;
}

interface CacheService extends BaseCache {
}
`, 'src/types.ts', 'typescript');

    const interfaces = result.symbols.filter((s) => s.kind === 'interface');
    expect(interfaces.length).toBe(2);
    expect(interfaces[0].name).toBe('UserRepository');
  });

  it('should extract functions', () => {
    const result = parseFile(`
export function createUser(name: string) {}
export async function deleteUser(id: string) {}
function internalHelper() {}
`, 'src/utils.ts', 'typescript');

    const functions = result.symbols.filter((s) => s.kind === 'function');
    expect(functions.length).toBe(3);
  });

  it('should extract imports', () => {
    const result = parseFile(`
import { UserService } from './services/user.js';
import type { User } from './models/user.js';
import * as path from 'path';
import express from 'express';
`, 'src/app.ts', 'typescript');

    expect(result.imports.length).toBe(4);
    expect(result.imports[0].source).toBe('./services/user.js');
    expect(result.imports[0].specifiers).toContain('UserService');
    expect(result.imports[2].isNamespace).toBe(true);
    expect(result.imports[3].isDefault).toBe(true);
  });

  it('should extract enums and type aliases', () => {
    const result = parseFile(`
export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export type UserId = string;
export const enum Direction { Up, Down }
`, 'src/types.ts', 'typescript');

    const enums = result.symbols.filter((s) => s.kind === 'enum');
    expect(enums.length).toBe(2);

    const types = result.symbols.filter((s) => s.kind === 'type-alias');
    expect(types.length).toBe(1);
    expect(types[0].name).toBe('UserId');
  });

  it('should detect API endpoints', () => {
    const result = parseFile(`
app.get('/api/users', getUsers);
app.post('/api/users', createUser);
router.delete('/api/users/:id', deleteUser);
`, 'src/routes.ts', 'typescript');

    expect(result.apiEndpoints.length).toBe(3);
    expect(result.apiEndpoints[0].method).toBe('GET');
    expect(result.apiEndpoints[0].path).toBe('/api/users');
    expect(result.apiEndpoints[1].method).toBe('POST');
  });
});

describe('Java Parser', () => {
  it('should extract classes and interfaces', () => {
    const result = parseFile(`
package com.example.service;

public class UserService implements IUserService {
    public User getUser(String id) {
        return null;
    }
}

public interface IUserService {
    User getUser(String id);
}
`, 'src/UserService.java', 'java');

    const classes = result.symbols.filter((s) => s.kind === 'class');
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe('UserService');

    const interfaces = result.symbols.filter((s) => s.kind === 'interface');
    expect(interfaces.length).toBe(1);
  });

  it('should extract imports', () => {
    const result = parseFile(`
import java.util.List;
import com.example.model.User;
import static org.junit.Assert.*;
`, 'src/Test.java', 'java');

    expect(result.imports.length).toBe(3);
  });

  it('should detect Spring API endpoints', () => {
    const result = parseFile(`
@RestController
public class UserController {
    @GetMapping("/api/users")
    public List<User> getUsers() {}

    @PostMapping("/api/users")
    public User createUser() {}
}
`, 'src/UserController.java', 'java');

    expect(result.apiEndpoints.length).toBe(2);
    expect(result.apiEndpoints[0].method).toBe('GET');
    expect(result.apiEndpoints[0].path).toBe('/api/users');
  });
});

describe('Python Parser', () => {
  it('should extract classes and functions', () => {
    const result = parseFile(`
class UserService(BaseService):
    def get_user(self, user_id):
        pass

    async def create_user(self, data):
        pass

def helper_function():
    pass
`, 'src/service.py', 'python');

    const classes = result.symbols.filter((s) => s.kind === 'class');
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe('UserService');

    const methods = result.symbols.filter((s) => s.kind === 'method');
    expect(methods.length).toBe(2);

    const functions = result.symbols.filter((s) => s.kind === 'function');
    expect(functions.length).toBe(1);
  });

  it('should extract imports', () => {
    const result = parseFile(`
from flask import Flask, request
import os
from models.user import User
`, 'src/app.py', 'python');

    expect(result.imports.length).toBe(3);
    expect(result.imports[0].source).toBe('flask');
    expect(result.imports[0].specifiers).toContain('Flask');
  });
});

describe('Go Parser', () => {
  it('should extract structs, interfaces, and functions', () => {
    const result = parseFile(`
package handlers

func HandleUsers(w http.ResponseWriter, r *http.Request) {
}

type UserHandler struct {
    service UserService
}

func (h *UserHandler) GetUser(w http.ResponseWriter, r *http.Request) {
}

type Repository interface {
    Find(id string) (*User, error)
}
`, 'src/handler.go', 'go');

    const functions = result.symbols.filter((s) => s.kind === 'function');
    expect(functions.length).toBe(1);

    const methods = result.symbols.filter((s) => s.kind === 'method');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('GetUser');

    const structs = result.symbols.filter((s) => s.kind === 'struct');
    expect(structs.length).toBe(1);

    const interfaces = result.symbols.filter((s) => s.kind === 'interface');
    expect(interfaces.length).toBe(1);
  });
});

describe('Architectural Role Detection', () => {
  it('should detect controller role', () => {
    const adapter = getLanguageAdapter('typescript')!;
    expect(adapter.detectArchitecturalRole('src/controllers/UserController.ts', [])).toBe('controller');
  });

  it('should detect service role', () => {
    const adapter = getLanguageAdapter('typescript')!;
    expect(adapter.detectArchitecturalRole('src/services/AuthService.ts', [])).toBe('service');
  });

  it('should detect test role', () => {
    const adapter = getLanguageAdapter('typescript')!;
    expect(adapter.detectArchitecturalRole('tests/auth.test.ts', [])).toBe('test');
  });

  it('should detect model role', () => {
    const adapter = getLanguageAdapter('java')!;
    expect(adapter.detectArchitecturalRole('src/models/User.java', [])).toBe('model');
  });
});
