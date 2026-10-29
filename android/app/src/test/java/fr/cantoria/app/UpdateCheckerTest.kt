// Tests unitaires de la comparaison semver (critère issue #57).
package fr.cantoria.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateCheckerTest {
    private val checker = UpdateChecker("owner", "repo")

    @Test fun `1_2_10 est plus recent que 1_2_9`() {
        assertTrue(checker.isNewer("1.2.10", "1.2.9"))
    }

    @Test fun `egalite n est pas une mise a jour`() {
        assertFalse(checker.isNewer("1.3.0", "1.3.0"))
    }

    @Test fun `version plus ancienne refusee`() {
        assertFalse(checker.isNewer("1.2.9", "1.3.0"))
    }

    @Test fun `segment manquant vaut zero`() {
        assertTrue(checker.isNewer("1.3", "1.2.9"))   // 1.3.0 > 1.2.9
        assertFalse(checker.isNewer("1.3", "1.3.0")) // 1.3.0 == 1.3.0
    }

    @Test fun `tag v prefixe accepte`() {
        assertTrue(checker.isNewer("v2.0.0", "1.9.9"))
    }

    @Test fun `major l emporte sur minor`() {
        assertTrue(checker.isNewer("2.0.0", "1.99.99"))
    }
}
