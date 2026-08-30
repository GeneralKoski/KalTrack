import { Card, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import type { ComparisonCell } from "@/src/domain/comparison";
import { theme } from "@/src/styles";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

/** Larghezza di una colonna di numeri. Cinque non ci stanno, e infatti scorrono. */
const COL_WIDTH = 84;
const LABEL_WIDTH = 104;

export interface ColumnPerson {
  handle: string;
  displayName: string;
}

export interface ComparisonSectionRow {
  key: string;
  label: string;
  cells: ComparisonCell[];
  format: (value: number | null) => string;
}

interface Props {
  title: string;
  people: ColumnPerson[];
  rows: ComparisonSectionRow[];
  /** Mostrato al posto della tabella quando non c'e' niente da confrontare. */
  empty?: string;
}

/**
 * Una tabella a piu' colonne che scorre di lato da sola.
 *
 * LA PAGINA NON SCORRE DI LATO, SCORRE LA TABELLA. Con cinque colonne di
 * numeri su un telefono qualcosa deve per forza uscire dallo schermo, ma se a
 * scorrere fosse la pagina intera si perderebbero di vista le etichette delle
 * righe, e una colonna di numeri senza l'etichetta accanto non vuol dire
 * niente. Cosi' la colonna delle etichette resta ferma.
 */
export const ComparisonColumns: React.FC<Props> = ({
  title,
  people,
  rows,
  empty,
}) => {
  const { colors } = useAppTheme();

  return (
    <>
      <SectionLabel style={styles.section}>{title}</SectionLabel>
      <Card style={styles.card}>
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {empty}
          </Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.labels}>
              <View style={styles.headCell} />
              {rows.map((riga) => (
                <View key={riga.key} style={styles.cell}>
                  <Text
                    style={[styles.label, { color: colors.textMuted }]}
                    numberOfLines={2}
                  >
                    {riga.label}
                  </Text>
                </View>
              ))}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
            >
              <View>
                <View style={styles.row}>
                  {people.map((persona) => (
                    <View key={persona.handle} style={styles.headCell}>
                      <Text
                        style={[styles.head, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {persona.displayName}
                      </Text>
                    </View>
                  ))}
                </View>

                {rows.map((riga) => (
                  <View key={riga.key} style={styles.row}>
                    {riga.cells.map((cella) => (
                      <View key={cella.handle} style={styles.cell}>
                        <Text
                          style={[
                            styles.value,
                            {
                              color: cella.leading
                                ? colors.accent
                                : colors.text,
                              fontWeight: cella.leading ? "700" : "500",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {riga.format(cella.value)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </Card>
    </>
  );
};

const styles = StyleSheet.create({
  section: { marginTop: theme.spacing.md },
  card: { gap: 0 },
  empty: { fontSize: 13, lineHeight: 18 },
  table: { flexDirection: "row" },
  labels: { width: LABEL_WIDTH },
  scroll: { paddingLeft: theme.spacing.xs },
  row: { flexDirection: "row" },
  headCell: {
    width: COL_WIDTH,
    height: 26,
    justifyContent: "center",
  },
  cell: {
    width: COL_WIDTH,
    height: 34,
    justifyContent: "center",
  },
  head: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
    letterSpacing: 0.5,
  },
  label: { fontSize: 13 },
  value: { fontSize: 16, textAlign: "right" },
});
