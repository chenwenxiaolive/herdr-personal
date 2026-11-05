"""Read macOS CPU counters and physical memory without third-party packages."""
import ctypes
import os
import re
import subprocess


def command(*argv):
    return subprocess.check_output(argv, text=True, timeout=2, env={**os.environ, "LC_ALL": "C"})


def sample():
    system = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
    system.mach_host_self.restype = ctypes.c_uint
    system.host_statistics.argtypes = [ctypes.c_uint, ctypes.c_int, ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint)]
    cpu = (ctypes.c_uint * 4)()
    count = ctypes.c_uint(4)
    # HOST_CPU_LOAD_INFO: user, system, idle, nice, across all processors.
    if system.host_statistics(system.mach_host_self(), 3, cpu, ctypes.byref(count)) != 0 or count.value != 4:
        raise RuntimeError("CPU counters unavailable")

    total = int(command("/usr/sbin/sysctl", "-n", "hw.memsize")) // 1024
    text = command("/usr/bin/vm_stat")
    page_size = int(re.search(r"page size of (\d+) bytes", text).group(1))
    pages = {key: int(value) for key, value in re.findall(r"^([^:\n]+):\s+(\d+)\.$", text, re.M)}
    # Application memory (excluding purgeable pages), wired memory, compressed
    # memory. Reclaimable file cache is not counted as application memory.
    used = (pages["Anonymous pages"] - pages["Pages purgeable"]
            + pages["Pages wired down"] + pages["Pages occupied by compressor"]) * page_size // 1024
    if not 0 <= used <= total:
        raise RuntimeError("Memory counters unavailable")

    # Match the Linux sampler's wire format so both share delta calculation.
    print(f"cpu {cpu[0]} {cpu[3]} {cpu[1]} {cpu[2]} 0 0 0 0")
    print(f"MemTotal: {total} kB")
    print(f"MemAvailable: {total - used} kB")


if __name__ == "__main__":
    sample()
