"""Reject corrupt files and incomplete/mixed-ABI private runtime bundles."""
import struct
import unittest
from elf32 import inspect, dependency_closure


class RuntimeValidation(unittest.TestCase):
    def test_reject_non_elf_and_wrong_machine(self):
        for data in [b'', b'\x7fELF' + b'\x00' * 80]:
            with self.assertRaises(ValueError):
                inspect(data)
        data = bytearray(52)
        struct.pack_into('<16sHHIIIIIHHHHHH', data, 0, b'\x7fELF\x01\x01\x01', 2, 3, 1, 0, 52, 0, 0x5000400, 52, 32, 0, 0, 0, 0)
        with self.assertRaisesRegex(ValueError, 'ARM'):
            inspect(data)

    def test_reject_truncated_program_table(self):
        data = struct.pack('<16sHHIIIIIHHHHHH', b'\x7fELF\x01\x01\x01', 2, 40, 1, 0, 52, 0, 0x5000400, 52, 32, 1, 0, 0, 0)
        with self.assertRaisesRegex(ValueError, 'program headers'):
            inspect(data)

    def test_missing_and_mixed_abi_dependency(self):
        executable = {'float_abi': 'hard', 'needed': ['libc.so.6']}
        with self.assertRaisesRegex(ValueError, 'Missing'):
            dependency_closure(executable, {})
        with self.assertRaisesRegex(ValueError, 'ABI'):
            dependency_closure(executable, {'libc.so.6': {'float_abi': 'soft', 'needed': []}})

    def test_transitive_and_cyclic_dependencies(self):
        executable = {'float_abi': 'hard', 'needed': ['liba.so']}
        libraries = {'liba.so': {'float_abi': 'hard', 'needed': ['libb.so']}, 'libb.so': {'float_abi': 'hard', 'needed': ['liba.so']}}
        self.assertEqual(dependency_closure(executable, libraries), ['liba.so', 'libb.so'])
        del libraries['libb.so']
        with self.assertRaisesRegex(ValueError, 'libb'):
            dependency_closure(executable, libraries)

    def test_reject_external_library_search_path(self):
        executable = {'float_abi': 'hard', 'needed': ['liba.so']}
        with self.assertRaisesRegex(ValueError, 'search path'):
            dependency_closure(executable, {'liba.so': {'float_abi': 'hard', 'needed': [], 'runpath': '/usr/lib'}})

    def test_reject_older_symbol_version_provider(self):
        executable = {'float_abi': 'hard', 'needed': ['libc.so.6'], 'required_versions': {'libc.so.6': ['GLIBC_2.17']}}
        libraries = {'libc.so.6': {'float_abi': 'hard', 'needed': [], 'provided_versions': ['GLIBC_2.4']}}
        with self.assertRaisesRegex(ValueError, 'GLIBC_2.17'):
            dependency_closure(executable, libraries)
        libraries['libc.so.6']['provided_versions'].append('GLIBC_2.17')
        self.assertEqual(dependency_closure(executable, libraries), ['libc.so.6'])


if __name__ == '__main__':
    unittest.main()
