"""Source tile topology for the non-jump tile between two ledge runs.

The native map keeps this tile blocked. It is a visual continuation of the
upper ledge, not a new movement/jump behavior. Native art must be checked by
export_ledge_profiles.ts before the generated field can be published.
"""

DIRECTIONS = {56: (1, 0), 57: (-1, 0), 58: (0, -1), 59: (0, 1)}
WATER = {16, 17, 19, 21, 23}


def ledge_corners(jumps, permission):
    """Return [x,z,horizontal_behavior,vertical_behavior] source corners.

    Both runs must actually be synthetic raised native ledges and share the
    same upper diagonal. Already joined edges, concave turns and open run ends
    do not satisfy this topology. No native permission is changed.
    """
    by_tile = {(x, z): behavior for x, z, behavior in jumps}
    corners = []
    for x, z, behavior in jumps:
        dx, _ = DIRECTIONS[behavior]
        if not dx:
            continue
        for dz, vertical in [(-1, 58), (1, 59)]:
            cx, cz = x, z + dz
            if by_tile.get((cx - dx, cz)) != vertical:
                continue
            blocked = permission(cx, cz)
            if blocked is None or not blocked & 0x8000:
                continue
            if blocked & 255 in DIRECTIONS or blocked & 255 in WATER:
                continue
            # Each edge has both an upper diagonal and a real lower neighbor.
            if any(permission(xx, zz) is None for xx, zz in [
                (cx - dx, cz - dz), (cx + dx, cz), (cx, cz + dz)
            ]):
                continue
            corners.append([cx, cz, behavior, vertical])
    return corners
